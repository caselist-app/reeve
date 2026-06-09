import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { sendWhatsApp } from '@/lib/comms/whatsapp'
import { sendSms } from '@/lib/comms/sms'

export type BroadcastPayload = {
  tour_id: string
  change_id: string                  // unique ID for this change event - the dedup dimension
  message: string                    // the change message to send
  affected_person_ids: string[]      // computed by the caller: only the people on the affected segment
}

// Sends a change notification to exactly the affected people.
// Not a blanket group send: the caller computes which people are affected
// (e.g. only the four people on the moved bus leg).
// Dedup dimension: change_id per person. Safe to retry.
export const broadcastJob = task({
  id: 'broadcast',
  run: async (payload: BroadcastPayload) => {
    const admin = createAdminClient()
    const results: Array<{ person_id: string; status: string }> = []

    for (const person_id of payload.affected_person_ids) {
      const key = buildSendKey(
        payload.tour_id,
        person_id,
        'broadcast',
        payload.change_id
      )

      const safe = await checkAndSet(key, 60 * 60 * 24 * 7)
      if (!safe) {
        results.push({ person_id, status: 'skipped_duplicate' })
        continue
      }

      const { data: person } = await admin
        .from('people')
        .select('whatsapp_number, sms_number, preferred_channel, name')
        .eq('id', person_id)
        .single()

      if (!person?.whatsapp_number && !person?.sms_number) {
        results.push({ person_id, status: 'skipped_no_contact' })
        continue
      }

      const channel = person.preferred_channel ?? 'whatsapp'
      const to = channel === 'sms'
        ? person.sms_number!
        : (person.whatsapp_number ?? person.sms_number!)

      try {
        if (channel === 'sms') {
          await sendSms({ to, body: payload.message })
        } else {
          await sendWhatsApp({ to, body: payload.message })
        }
        results.push({ person_id, status: 'sent' })
      } catch (err) {
        // Log the failure but continue to the next person.
        // Failed sends are not retried here - the job-level retry handles that.
        console.error(`Broadcast send failed for person ${person_id}:`, err)
        results.push({ person_id, status: 'failed' })
      }
    }

    return { results }
  },
})
