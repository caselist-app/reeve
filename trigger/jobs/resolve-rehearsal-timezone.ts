import { task } from '@trigger.dev/sdk/v3'
import { resolveRehearsalTimezone } from '@/lib/logistics/hub-resolver'

export type ResolveRehearsalTimezonePayload = {
  rehearsal_id: string
}

// Resolves and caches venue_lat, venue_lng and timezone for a rehearsal.
// Triggered on rehearsal create (unconditionally, no-op with no address) and
// whenever address changes on update. Cached until re-triggered.
export const resolveRehearsalTimezoneJob = task({
  id: 'resolve-rehearsal-timezone',
  run: async (payload: ResolveRehearsalTimezonePayload) => {
    await resolveRehearsalTimezone(payload.rehearsal_id)
  },
})
