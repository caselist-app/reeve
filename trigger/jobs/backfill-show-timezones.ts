import { task } from '@trigger.dev/sdk/v3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveHub, resolveRehearsalTimezone } from '@/lib/logistics/hub-resolver'
import type { Database } from '@/lib/types/database'

type Client = SupabaseClient<Database>

// One-off backfill (REE-250): re-runs resolveHub() for every show that was
// hub-resolved before timezone resolution shipped, so existing shows pick up
// a zone without a TM re-touching the address. resolveHub()'s own cache-hit
// guard already treats hub_resolved_at-not-null / timezone-null as
// unresolved (lib/logistics/hub-resolver.ts), so calling it on every
// affected row is sufficient, and safe to run more than once: a row that
// picks up a timezone drops out of the query on the next run. Split out from
// the task wrapper, same reasoning as runFlightStatusCheck, so it can run
// against a real Postgres in a test with no Trigger.dev runtime involved.
// Trigger manually from the Trigger.dev dashboard - no schedule is
// registered, same rationale as seed-airports-reference.
export async function runBackfillShowTimezones(admin: Client) {
  const { data: shows, error } = await admin
    .from('shows')
    .select('id')
    .not('hub_resolved_at', 'is', null)
    .is('timezone', null)

  if (error) throw error
  if (!shows || shows.length === 0) {
    return { checked: 0, resolved: 0, failed: 0 }
  }

  let resolved = 0
  let failed = 0

  for (const show of shows) {
    try {
      await resolveHub(show.id)
      resolved++
    } catch (err) {
      failed++
      console.error(`[backfill-show-timezones] resolveHub failed for show ${show.id}`, err)
    }
  }

  return { checked: shows.length, resolved, failed }
}

// Same backfill for rehearsals with an address but no timezone. Unlike
// resolveHub, resolveRehearsalTimezone has no cache-hit guard of its own (it
// always re-geocodes when an address is present) - safe here only because
// the query already scopes to rows that are genuinely unresolved.
export async function runBackfillRehearsalTimezones(admin: Client) {
  const { data: rehearsals, error } = await admin
    .from('rehearsals')
    .select('id')
    .not('address', 'is', null)
    .is('timezone', null)

  if (error) throw error
  if (!rehearsals || rehearsals.length === 0) {
    return { checked: 0, resolved: 0, failed: 0 }
  }

  let resolved = 0
  let failed = 0

  for (const rehearsal of rehearsals) {
    try {
      await resolveRehearsalTimezone(rehearsal.id)
      resolved++
    } catch (err) {
      failed++
      console.error(`[backfill-show-timezones] resolveRehearsalTimezone failed for rehearsal ${rehearsal.id}`, err)
    }
  }

  return { checked: rehearsals.length, resolved, failed }
}

export const backfillShowTimezonesJob = task({
  id: 'backfill-show-timezones',
  run: async () => {
    return runBackfillShowTimezones(createAdminClient())
  },
})

export const backfillRehearsalTimezonesJob = task({
  id: 'backfill-rehearsal-timezones',
  run: async () => {
    return runBackfillRehearsalTimezones(createAdminClient())
  },
})
