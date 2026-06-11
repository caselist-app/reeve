import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { sendWhatsApp } from '@/lib/comms/whatsapp'

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

      const { data: personRow } = await admin
        .from('people')
        .select('contacts(whatsapp_number)')
        .eq('id', person_id)
        .single()

      const person = personRow?.contacts as { whatsapp_number: string | null } | null

      if (!person?.whatsapp_number) {
        results.push({ person_id, status: 'skipped_no_contact' })
        continue
      }

      let wamid: string | null = null

      try {
        const result = await sendWhatsApp({ to: person.whatsapp_number, body: payload.message })
        wamid = result.wamid

        // Log the send. Admin client bypasses RLS since jobs run outside user auth.
        await admin.from('broadcast_log').insert({
          tour_id: payload.tour_id,
          person_id,
          change_type: payload.change_type,
          message: payload.message,
          wamid,
          sent_at: new Date().toISOString(),
        })

        results.push({ person_id, status: 'sent' })
      } catch (err) {
        // Log the failure but continue to the next person.
        // Failed sends are not retried at this level - job-level retry handles that.
        console.error(`Broadcast send failed for person ${person_id}:`, err)
        results.push({ person_id, status: 'failed' })
      }
    }

    return { results }
  },
})
