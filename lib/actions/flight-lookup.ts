'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import {
  lookupFlightByNumber,
  searchFlightsByRoute,
  searchRouteTimetable,
  type NormalizedFlightLookup,
  type NormalizedRouteTimetableEntry,
} from '@/lib/logistics/adapters/airlabs'

// PostgREST caps a response at a project-configured max (Supabase's default
// is 1000 rows, "Max Rows" under Settings > API) regardless of what range a
// client requests - asking for a wider .range() does not override it, the
// server just clamps back down. Confirmed live: airports_reference has
// ~9,880 rows ordered alphabetically by name, and an unranged/wide-ranged
// select both truncated to exactly 1000, cutting off before "L" - so
// "London" and "Las Vegas" never reached the client, no error, just a
// shorter-than-expected list. The only reliable fix is to page through in
// chunks and keep requesting until a page comes back short, same pattern
// already used against AirLabs itself in fetchAllAirlines().
const REFERENCE_PAGE_SIZE = 1000

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

async function fetchAllRows<T extends Record<string, unknown>>(
  supabase: SupabaseServerClient,
  table: 'airlines_reference' | 'airports_reference',
  select: string
): Promise<T[]> {
  const rows: T[] = []
  let from = 0

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('name')
      .range(from, from + REFERENCE_PAGE_SIZE - 1)

    if (error || !data) break
    rows.push(...(data as unknown as T[]))
    if (data.length < REFERENCE_PAGE_SIZE) break
    from += REFERENCE_PAGE_SIZE
  }

  return rows
}

// Returns the cached airline list for the Add Flight search step. This is
// reference data (RLS: any authenticated account reads the same table), but
// still gated behind requireUser() like every server action, per project rule.
export async function getAirlinesReference(): Promise<
  { iataCode: string | null; icaoCode: string | null; name: string }[]
> {
  await requireUser()
  const supabase = await createClient()

  const rows = await fetchAllRows<{ iata_code: string | null; icao_code: string | null; name: string }>(
    supabase,
    'airlines_reference',
    'iata_code, icao_code, name'
  )

  return rows.map((a) => ({ iataCode: a.iata_code, icaoCode: a.icao_code, name: a.name }))
}

// Returns the cached airport list for "Find by route"'s From/To search.
// Same rationale as getAirlinesReference: reference data, RLS-open, still
// gated behind requireUser() per project rule.
export async function getAirportsReference(): Promise<
  { iataCode: string; icaoCode: string | null; name: string; city: string | null }[]
> {
  await requireUser()
  const supabase = await createClient()

  const rows = await fetchAllRows<{ iata_code: string; icao_code: string | null; name: string; city: string | null }>(
    supabase,
    'airports_reference',
    'iata_code, icao_code, name, city'
  )

  return rows.map((a) => ({ iataCode: a.iata_code, icaoCode: a.icao_code, name: a.name, city: a.city }))
}

export type FlightLookupResult = {
  error: string | null
  lookup: NormalizedFlightLookup | null
}

// Wraps the AirLabs adapter for the Add Flight flow. requireUser() gates this
// even though it makes no tour-scoped read, since it's the only thing standing
// between an unauthenticated caller and burning the tour's AirLabs quota.
export async function lookupFlightForAdd(flightIata: string): Promise<FlightLookupResult> {
  await requireUser()

  if (!/^[A-Za-z0-9]{2,8}$/.test(flightIata)) {
    return { error: 'Not a valid flight number.', lookup: null }
  }

  try {
    const lookup = await lookupFlightByNumber(flightIata.toUpperCase())
    if (!lookup) return { error: 'No flight found for that number.', lookup: null }
    return { error: null, lookup }
  } catch (err) {
    // The adapter's own error messages name the provider directly (useful in
    // logs, not something the TM should ever see) - log server-side, return
    // a generic message to the client.
    console.error('[lookupFlightForAdd]', err)
    return { error: 'Flight lookup failed. Try again in a moment.', lookup: null }
  }
}

export type FlightRouteSearchResult = {
  error: string | null
  results: NormalizedFlightLookup[]
}

// "Find by route": the TM knows the airline and the two airports but not the
// flight number. Only returns matches on AirLabs' near-term board (same ~10h
// ceiling as lookupFlightForAdd's underlying endpoint) - a route search for a
// flight weeks out will come back empty, not an error.
export async function findFlightsByRoute(
  airlineIata: string,
  depIata: string,
  arrIata: string
): Promise<FlightRouteSearchResult> {
  await requireUser()

  const code = /^[A-Za-z]{2,3}$/
  const iata = /^[A-Za-z]{3}$/
  if (!code.test(airlineIata) || !iata.test(depIata) || !iata.test(arrIata)) {
    return { error: 'Enter a valid airline code and two airport codes.', results: [] }
  }

  try {
    const results = await searchFlightsByRoute({
      airlineIata: airlineIata.toUpperCase(),
      depIata: depIata.toUpperCase(),
      arrIata: arrIata.toUpperCase(),
    })
    return { error: null, results }
  } catch (err) {
    console.error('[findFlightsByRoute]', err)
    return { error: 'Flight search failed. Try again in a moment.', results: [] }
  }
}

export type RouteTimetableSearchResult = {
  error: string | null
  results: NormalizedRouteTimetableEntry[]
}

// "Search timetable": the TM knows the airline, route, and a specific future
// date/time but not the flight number - the case findFlightsByRoute can't
// help with, since that only sees AirLabs' live board (~10h ahead). This
// queries the Routes DB instead, a static schedule (not real-time), and
// returns every flight number AirLabs has on record for the route regardless
// of date - the caller matches `days` against the TM's chosen date's weekday.
export async function findRouteTimetable(
  airlineIata: string,
  depIata: string,
  arrIata: string
): Promise<RouteTimetableSearchResult> {
  await requireUser()

  const code = /^[A-Za-z]{2,3}$/
  const iata = /^[A-Za-z]{3}$/
  if (!code.test(airlineIata) || !iata.test(depIata) || !iata.test(arrIata)) {
    return { error: 'Enter a valid airline code and two airport codes.', results: [] }
  }

  try {
    const results = await searchRouteTimetable({
      airlineIata: airlineIata.toUpperCase(),
      depIata: depIata.toUpperCase(),
      arrIata: arrIata.toUpperCase(),
    })
    return { error: null, results }
  } catch (err) {
    console.error('[findRouteTimetable]', err)
    return { error: 'Timetable search failed. Try again in a moment.', results: [] }
  }
}
