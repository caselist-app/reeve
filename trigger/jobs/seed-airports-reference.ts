import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchAllAirports, type NormalizedAirport } from '@/lib/logistics/adapters/airlabs'

// One-off / occasionally-refreshed job: (re)populates airports_reference
// from AirLabs' airports endpoint. Never called per-keystroke or
// per-request (the "Find by route" step's From/To search filters the
// cached table client-side). Trigger manually from the Trigger.dev
// dashboard whenever the cache needs refreshing - no schedule is
// registered for this by default, same rationale as
// seed-airlines-reference.
//
// Full delete-then-insert rather than upsert: airports_reference has no
// unique constraint, so this is the simplest way to guarantee no
// duplicates on a re-run.
export const seedAirportsReferenceJob = task({
  id: 'seed-airports-reference',
  run: async () => {
    const admin = createAdminClient()
    const allAirports = await fetchAllAirports()

    // Only IATA-coded airports are usable at all: route search constructs
    // dep_iata/arr_iata against AirLabs' /schedules endpoint, which takes
    // 3-letter IATA codes. An airport with no IATA code can never be picked
    // from this search, so it's excluded from the cache entirely rather
    // than just deprioritised.
    const iataOnly = allAirports.filter(
      (a): a is NormalizedAirport & { iataCode: string } => a.iataCode !== null
    )

    // AirLabs' airport dump has more than one row for some IATA codes
    // (verified live: MXQ). airports_reference has no unique constraint on
    // iata_code, and the From/To search keys its results by iata_code, so
    // duplicates would both violate the "one code, one airport" assumption
    // the picker relies on and produce a React duplicate-key warning.
    // First occurrence wins; AirLabs doesn't expose a way to tell which
    // entry for a shared code is the "real" one.
    const seen = new Set<string>()
    const airports = iataOnly.filter((a) => {
      if (seen.has(a.iataCode)) return false
      seen.add(a.iataCode)
      return true
    })

    if (airports.length === 0) {
      return { seeded: 0, skipped: allAirports.length }
    }

    const { error: deleteError } = await admin
      .from('airports_reference')
      .delete()
      .not('id', 'is', null) // delete-all guard: Supabase requires a filter on delete

    if (deleteError) throw deleteError

    // Batch inserts to stay well clear of any request-size limit.
    const BATCH_SIZE = 500
    let seeded = 0

    for (let i = 0; i < airports.length; i += BATCH_SIZE) {
      const batch = airports.slice(i, i + BATCH_SIZE).map((a) => ({
        iata_code: a.iataCode,
        icao_code: a.icaoCode,
        name: a.name,
        city: a.city,
        country_code: a.countryCode,
      }))

      const { error: insertError } = await admin.from('airports_reference').insert(batch)
      if (insertError) throw insertError
      seeded += batch.length
    }

    return { seeded }
  },
})
