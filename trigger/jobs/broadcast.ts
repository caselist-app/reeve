import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTemplate } from '@/lib/comms/whatsapp'

// Template ID for the approved Meta broadcast template.
// Set in env once Meta approves. Until then, proactive sends are skipped.
const BROADCAST_TEMPLATE = process.env.WHATSAPP_TEMPLATE_BROADCAST

export type BroadcastPayload = {
  tour_id: string
  change_id: string                  // unique ID for this change event - the dedup dimension
  change_type: string                // mirrors ChangeDescriptor.type for broadcast_log
  message: string                    // the change message to send
  affected_person_ids: string[]      // computed by the caller: only the people on the affected record
}

// Sends a change notification to exactly the affected people.
// Not a blanket group send: the caller computes who is affected
// (e.g. only the four people on the moved bus leg).
// Dedup dimension: change_id per person. Safe to retry.
// Logs each send to broadcast_log with wamid for delivery receipt tracking.
export const broadcastJob = task({
  id: 'broadcast',
  run: async (payload: BroadcastPayload) => {
    const admin = createAdminClient()
    const results: Array<{ person_id: string; status: string }> = []

    for (const person_id of payload.affected_person_ids) {
      // Claim the send slot. A unique violation means already sent for this change+person.
      const claimKey = {
        tour_id: payload.tour_id,
        person_id,
        notification_type: 'broadcast' as const,
        channel: 'whatsapp' as const,
        dedup_dimension: payload.change_id,
      }
      const { error: claimError } = await admin
        .from('notification_log')
        .insert({ ...claimKey, status: 'queued' })

      if (claimError?.code === '23505') {
        results.push({ person_id, status: 'skipped_duplicate' })
        continue
      }
      if (claimError) {
        results.push({ person_id, status: 'failed' })
        continue
      }

      const { data: personRow } = await admin
        .from('people')
        .select('contacts(whatsapp_number)')
        .eq('id', person_id)
        .single()

      const person = personRow?.contacts as { whatsapp_number: string | null } | null

      if (!person?.whatsapp_number) {
        await admin.from('notification_log').delete().match(claimKey)
        results.push({ person_id, status: 'skipped_no_contact' })
        continue
      }

      if (!BROADCAST_TEMPLATE) {
        await admin.from('notification_log').delete().match(claimKey)
        console.warn('[broadcast] WHATSAPP_TEMPLATE_BROADCAST not configured, skipping send')
        results.push({ person_id, status: 'skipped_template_not_configured' })
        continue
      }

      try {
        const result = await sendTemplate({
          to: person.whatsapp_number,
          templateName: BROADCAST_TEMPLATE,
          languageCode: 'en',
          bodyParams: [payload.message],
        })

        await admin
          .from('notification_log')
          .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.wamid })
          .match(claimKey)

        // Keep broadcast_log for delivery receipt tracking (wamid -> delivered_at/read_at).
        await admin.from('broadcast_log').insert({
          tour_id: payload.tour_id,
          person_id,
          change_type: payload.change_type,
          message: payload.message,
          wamid: result.wamid,
          sent_at: new Date().toISOString(),
        })

        results.push({ person_id, status: 'sent' })
      } catch (err) {
        // Release the claim so the job retry can re-attempt this person.
        await admin.from('notification_log').delete().match(claimKey)
        console.error(`[broadcast] send failed for person ${person_id}:`, err)
        results.push({ person_id, status: 'failed' })
      }
    }

    return { results }
  },
})
