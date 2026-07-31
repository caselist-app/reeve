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
    const airlines = await fetchAllAirlines()

    if (airlines.length === 0) {
      return { seeded: 0 }
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
