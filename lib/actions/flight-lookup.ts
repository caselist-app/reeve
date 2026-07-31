'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { lookupFlightByNumber, type NormalizedFlightLookup } from '@/lib/logistics/adapters/airlabs'

// Returns the cached airline list for the Add Flight search step. This is
// reference data (RLS: any authenticated account reads the same table), but
// still gated behind requireUser() like every server action, per project rule.
export async function getAirlinesReference(): Promise<
  { iataCode: string | null; icaoCode: string | null; name: string }[]
> {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('airlines_reference')
    .select('iata_code, icao_code, name')
    .order('name')

  if (error || !data) return []

  return data.map((a) => ({ iataCode: a.iata_code, icaoCode: a.icao_code, name: a.name }))
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
    return { error: err instanceof Error ? err.message : 'Flight lookup failed.', lookup: null }
  }
}
