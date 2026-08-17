import { task } from '@trigger.dev/sdk/v3'
import { notify } from '@/lib/comms/notify'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotifyContact } from '@/lib/comms/notify/types'

export type BroadcastPayload = {
  tour_id: string
  change_id: string           // unique ID for this change event - the dedup dimension
  change_type: string         // retained for caller context; not persisted anywhere
  message: string             // the change message to send
  affected_person_ids: string[]
}

// Sends a change_alert notification to exactly the affected people.
// Not a blanket group send: the caller computes who is affected
// (e.g. only the four people on the moved bus leg).
// notify() owns channel resolution, claim/send/release, and idempotency.
// Dedup dimension: change_id per person. Safe to retry.
export const broadcastJob = task({
  id: 'broadcast',
  run: async (payload: BroadcastPayload) => {
    const results: Array<{ person_id: string; status: string }> = []

    // Batch the people -> contacts lookup once for the whole affected set,
    // rather than letting notify() re-fetch it per person (REE-264).
    const contactsById = new Map<string, NotifyContact | null>()
    if (payload.affected_person_ids.length > 0) {
      const admin = createAdminClient()
      const { data: peopleRows } = await admin
        .from('people')
        .select('id, contacts(name, whatsapp_number, telegram_chat_id, contact_email, operational_channel, email_enabled)')
        .eq('tour_id', payload.tour_id)
        .in('id', payload.affected_person_ids)

      for (const row of peopleRows ?? []) {
        contactsById.set(row.id, row.contacts as NotifyContact | null)
      }
    }

    for (const person_id of payload.affected_person_ids) {
      const result = await notify({
        tourId: payload.tour_id,
        personId: person_id,
        type: 'change_alert',
        data: { message: payload.message },
        dedupDimension: payload.change_id,
        contact: contactsById.get(person_id) ?? null,
      })

      const status = result.channels.length === 0
        ? 'skipped_no_channel'
        : result.channels.every((c) => c.outcome === 'skipped_already_sent')
          ? 'skipped_duplicate'
          : result.channels.some((c) => c.outcome === 'sent')
            ? 'sent'
            : 'failed'

      results.push({ person_id, status })
    }

    return { results }
  },
})
