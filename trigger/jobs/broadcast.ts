import { task } from '@trigger.dev/sdk/v3'
import { notify } from '@/lib/comms/notify'

export type BroadcastPayload = {
  tour_id: string
  change_id: string           // unique ID for this change event - the dedup dimension
  change_type: string         // retained for caller context; no longer written to broadcast_log
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

    for (const person_id of payload.affected_person_ids) {
      const result = await notify({
        tourId: payload.tour_id,
        personId: person_id,
        type: 'change_alert',
        data: { message: payload.message },
        dedupDimension: payload.change_id,
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
