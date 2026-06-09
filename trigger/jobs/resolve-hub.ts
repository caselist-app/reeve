import { task } from '@trigger.dev/sdk/v3'
import { resolveHub } from '@/lib/logistics/hub-resolver'

export type ResolveHubPayload = {
  show_id: string
}

// Resolves and caches the transport hub for a show.
// Triggered on show create and whenever venue_name or address changes.
// Writes transport_hub_iata, transport_hub_rail, hub_ground_minutes,
// and hub_resolved_at to the show row. Cached indefinitely until re-triggered.
export const resolveHubJob = task({
  id: 'resolve-hub',
  run: async (payload: ResolveHubPayload) => {
    const hub = await resolveHub(payload.show_id)
    return { hub }
  },
})
