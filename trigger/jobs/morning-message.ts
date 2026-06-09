import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { buildMorningMessageData, renderMorningMessage } from '@/lib/comms/templates/morning-message'
import { sendWhatsApp } from '@/lib/comms/whatsapp'
import { sendSms } from '@/lib/comms/sms'

export type MorningMessagePayload = {
  tour_id: string
  person_id: string
  show_id: string
  show_date: string   // YYYY-MM-DD, used as the dedup dimension
}

// Sent on show days to each person via their preferred_channel.
// Dedup dimension: show date. One message per person per show day, ever.
// Scheduled externally: a daily cron finds all shows for today and triggers
// one instance of this task per person on that tour.
export const morningMessageJob = task({
  id: 'morning-message',
  run: async (payload: MorningMessagePayload) => {
    const key = buildSendKey(
      payload.tour_id,
      payload.person_id,
      'morning_message',
      payload.show_date
    )

    const safe = await checkAndSet(key, 60 * 60 * 48) // 48h TTL
    if (!safe) {
      return { skipped: true, reason: 'already_sent' }
    }

    const admin = createAdminClient()
    const { data: person } = await admin
      .from('people')
      .select('preferred_channel, whatsapp_number, sms_number')
      .eq('id', payload.person_id)
      .single()

    if (!person?.whatsapp_number && !person?.sms_number) {
      return { skipped: true, reason: 'no_contact_number' }
    }

    const data = await buildMorningMessageData(payload.person_id, payload.show_id)
    if (!data) return { skipped: true, reason: 'data_unavailable' }

    const message = renderMorningMessage(data)
    const channel = person.preferred_channel ?? 'whatsapp'
    const to = channel === 'sms'
      ? person.sms_number!
      : (person.whatsapp_number ?? person.sms_number!)

    if (channel === 'sms') {
      await sendSms({ to, body: message })
    } else {
      await sendWhatsApp({ to, body: message })
    }

    return { sent: true, channel, to }
  },
})
