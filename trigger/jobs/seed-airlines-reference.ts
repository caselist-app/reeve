import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllAirlines } from '@/lib/logistics/adapters/airlabs'

// One-off / occasionally-refreshed job: (re)populates airlines_reference
// from AirLabs' airlines endpoint. Never called per-keystroke or per-request
// (the Add Flight search step filters the cached table client-side).
// Trigger manually from the Trigger.dev dashboard whenever the cache needs
// refreshing (new airlines, renamed carriers) - no schedule is registered
// for this by default, since a monthly-or-slower cadence is more than
// enough and the free AirLabs plan has a small total call budget.
//
// Full delete-then-insert rather than upsert: airlines_reference has no
// unique constraint on iata_code, so this is the simplest way to guarantee
// no duplicates on a re-run. The table is pure cache with no foreign keys
// pointing at it, so replacing it wholesale is safe.
export const seedAirlinesReferenceJob = task({
  id: 'seed-airlines-reference',
  run: async () => {
    const admin = createAdminClient()
    const allAirlines = await fetchAllAirlines()

    // Only IATA-coded airlines are usable by this feature at all: the Add
    // Flight flow constructs flight_iata as `${airlineIataCode}${number}` to
    // query AirLabs, so an airline with no IATA code can never resolve to a
    // real lookup. AirLabs' database is ~6,500 entries deep, most of them
    // small/historic/military operators with no IATA code - keeping them
    // out of the cache entirely (rather than just deprioritising them in
    // search ranking) is both correct and a much smaller table to ship to
    // the client on every Add Flight open.
    const airlines = allAirlines.filter((a) => a.iataCode)

    if (airlines.length === 0) {
      return { seeded: 0, skipped: allAirlines.length }
    }

    const { error: deleteError } = await admin
      .from('airlines_reference')
      .delete()
      .not('id', 'is', null) // delete-all guard: Supabase requires a filter on delete

    if (deleteError) throw deleteError

    // Batch inserts to stay well clear of any request-size limit.
    const BATCH_SIZE = 500
    let seeded = 0

    for (let i = 0; i < airlines.length; i += BATCH_SIZE) {
      const batch = airlines.slice(i, i + BATCH_SIZE).map((a) => ({
        iata_code: a.iataCode,
        icao_code: a.icaoCode,
        name: a.name,
      }))

      const { error: insertError } = await admin.from('airlines_reference').insert(batch)
      if (insertError) throw insertError
      seeded += batch.length
    }

    return { seeded }
  },
})
