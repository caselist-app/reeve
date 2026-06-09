import { createAdminClient } from '@/lib/supabase/admin'
import type { HubResolution } from '@/lib/logistics/types'

// Resolution order (stops at first hit):
// 1. Known-venue lookup - handles festivals that have no nearby airport.
//    Hellfest is the canonical test case: the venue is Clisson, which has no
//    transport hub. A naive geocode would fail. We resolve it manually to NTE.
// 2. Google Maps geocode + nearest hub (V1: structured as a seam, API call TBD).
// 3. Standard buffers fallback.

type KnownVenueEntry = {
  iata: string | null
  rail: string | null
  ground_minutes: number
}

// Keyed by lowercase venue name or city. Expand this map as the known-venue
// KB grows. Festivals go here first because geocoding a festival site fails.
const KNOWN_VENUES: Record<string, KnownVenueEntry> = {
  hellfest: { iata: 'NTE', rail: null, ground_minutes: 40 },
  'clisson': { iata: 'NTE', rail: null, ground_minutes: 40 },
  'glastonbury': { iata: 'BRS', rail: 'Castle Cary', ground_minutes: 35 },
  'download festival': { iata: 'EMA', rail: 'Derby', ground_minutes: 20 },
  'reading festival': { iata: 'LHR', rail: 'Reading', ground_minutes: 15 },
  'leeds festival': { iata: 'LBA', rail: 'Leeds', ground_minutes: 25 },
  'coachella': { iata: 'PSP', rail: null, ground_minutes: 25 },
  'lollapalooza': { iata: 'ORD', rail: null, ground_minutes: 30 },
}

// Standard transit buffers used when no specific data is available.
const AIRPORT_TRANSIT_MIN = 45
const RAIL_TRANSIT_MIN = 15

function lookupKnownVenue(venueName: string): KnownVenueEntry | null {
  const key = venueName.toLowerCase().trim()
  return KNOWN_VENUES[key] ?? null
}

// Google Maps geocode + nearest hub.
// V1 seam: structured correctly, implementation filled in once Maps API is wired.
async function resolveViaGoogleMaps(
  address: string
): Promise<KnownVenueEntry | null> {
  if (!process.env.GOOGLE_MAPS_API_KEY || !address) return null
  // TODO: call Geocoding API, then Places Nearby for airports and rail stations,
  // then Distance Matrix for drive times. Return null until implemented.
  return null
}

function standardFallback(): KnownVenueEntry {
  return {
    iata: null,
    rail: null,
    ground_minutes: AIRPORT_TRANSIT_MIN,
  }
}

export async function resolveHub(show_id: string): Promise<HubResolution> {
  const admin = createAdminClient()

  const { data: show, error } = await admin
    .from('shows')
    .select('id, venue_name, address, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes')
    .eq('id', show_id)
    .single()

  if (error || !show) throw new Error(`Show not found: ${show_id}`)

  // Return cached resolution if it exists.
  if (show.hub_resolved_at) {
    return {
      iata: show.transport_hub_iata,
      rail: show.transport_hub_rail,
      ground_minutes: show.hub_ground_minutes ?? AIRPORT_TRANSIT_MIN,
    }
  }

  // Resolution: known-venue -> Maps -> fallback.
  let resolved: KnownVenueEntry | null =
    lookupKnownVenue(show.venue_name ?? '') ??
    (await resolveViaGoogleMaps(show.address ?? '')) ??
    standardFallback()

  // Cache on the show row. Re-resolve only if venue address changes.
  await admin
    .from('shows')
    .update({
      transport_hub_iata: resolved.iata,
      transport_hub_rail: resolved.rail,
      hub_ground_minutes: resolved.ground_minutes,
      hub_resolved_at: new Date().toISOString(),
    })
    .eq('id', show_id)

  return {
    iata: resolved.iata,
    rail: resolved.rail,
    ground_minutes: resolved.ground_minutes,
  }
}
