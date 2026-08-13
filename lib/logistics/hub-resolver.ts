import { createAdminClient } from '@/lib/supabase/admin'
import { nearestAirport, estimateGroundMinutes } from '@/lib/logistics/airports'
import { AIRPORT_TRANSIT_MIN, RAIL_TRANSIT_MIN } from '@/lib/logistics/constants'
import type { HubResolution } from '@/lib/logistics/types'

// Resolution order (stops at first hit):
// 1. Known-venue lookup - handles festivals that have no nearby airport.
//    Hellfest is the canonical test case: the venue is Clisson, which has no
//    transport hub. A naive geocode would fail. We resolve it manually to NTE.
// 2. Google Maps geocode + nearest airport from bundled airport list.
// 3. null - the planner surfaces an error asking the TM to add an address.

type KnownVenueEntry = {
  iata: string | null
  rail: string | null
  ground_minutes: number
  // Known venues are not geocoded, so there is no lat/lng to cache on the
  // show row. The venue map block simply has nothing to show for these.
  lat: null
  lng: null
}

// Keyed by lowercase venue name or city. Expand this map as the known-venue
// KB grows. Festivals go here first because geocoding a festival site fails.
const KNOWN_VENUES: Record<string, KnownVenueEntry> = {
  hellfest: { iata: 'NTE', rail: null, ground_minutes: 40, lat: null, lng: null },
  clisson: { iata: 'NTE', rail: null, ground_minutes: 40, lat: null, lng: null },
  glastonbury: { iata: 'BRS', rail: 'Castle Cary', ground_minutes: 35, lat: null, lng: null },
  'download festival': { iata: 'EMA', rail: 'Derby', ground_minutes: 20, lat: null, lng: null },
  'reading festival': { iata: 'LHR', rail: 'Reading', ground_minutes: 15, lat: null, lng: null },
  'leeds festival': { iata: 'LBA', rail: 'Leeds', ground_minutes: 25, lat: null, lng: null },
  coachella: { iata: 'PSP', rail: null, ground_minutes: 25, lat: null, lng: null },
  lollapalooza: { iata: 'ORD', rail: null, ground_minutes: 30, lat: null, lng: null },
}

// A resolution that may or may not carry a geocode, unlike KnownVenueEntry
// whose lat/lng are always absent.
type Resolution = Omit<KnownVenueEntry, 'lat' | 'lng'> & {
  lat: number | null
  lng: number | null
}

function lookupKnownVenue(venueName: string): Resolution | null {
  const key = venueName.toLowerCase().trim()
  return KNOWN_VENUES[key] ?? null
}

// REE-214: the nearest-hub lookup is a local haversine calculation against a
// bundled airport list, no network call, so it can run inline in the same
// request as the save rather than waiting on the async resolve-hub job. That
// job exists only to wait on a server-side geocode; once coordinates are
// already known (a Places pick, REE-213) or the venue is a known-venue match,
// there is nothing left to wait for. Returns null when neither applies (an
// address typed by hand with no Places selection), which is the caller's
// signal to fall back to the async job.
export function resolveHubSync(
  venueName: string,
  lat: number | null,
  lng: number | null,
): HubResolution | null {
  const known = lookupKnownVenue(venueName)
  if (known) return { iata: known.iata, rail: known.rail, ground_minutes: known.ground_minutes }

  if (lat == null || lng == null) return null

  const { airport, distKm } = nearestAirport(lat, lng)
  return { iata: airport.iata, rail: null, ground_minutes: estimateGroundMinutes(distKm) }
}

// Google Maps geocode + nearest airport from the bundled airport list.
// Geocodes the venue address to lat/lng, then finds the nearest airport by
// haversine distance. Ground time is estimated from straight-line distance.
async function resolveViaGoogleMaps(
  address: string
): Promise<Resolution | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !address) return null

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  let data: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  try {
    const res = await fetch(url)
    data = (await res.json()) as typeof data
  } catch {
    return null
  }

  if (data.status !== 'OK' || !data.results[0]) return null

  const { lat, lng } = data.results[0].geometry.location
  const { airport, distKm } = nearestAirport(lat, lng)
  const groundMin = estimateGroundMinutes(distKm)

  return {
    iata: airport.iata,
    rail: null,
    ground_minutes: groundMin,
    lat,
    lng,
  }
}

// Returns the departure hub identifier for a person traveling to a given show.
// Resolution order:
// 1. The hub of the immediately preceding show in the same tour (person is
//    already on the road).
// 2. The person's home_city, geocoded to its nearest airport via Maps (V1 seam:
//    returns the city string directly until Maps geocoding is wired).
// 3. null - the planner will prompt the TM to set a departure city manually.
export async function getFromHub(
  person_id: string,
  show_id: string
): Promise<string | null> {
  const admin = createAdminClient()

  // Fetch the current show to get its tour and date.
  const { data: currentShow } = await admin
    .from('shows')
    .select('tour_id, date')
    .eq('id', show_id)
    .single()

  if (!currentShow) return null

  // Find the immediately preceding show in the same tour.
  const { data: priorShow } = await admin
    .from('shows')
    .select('transport_hub_iata, transport_hub_rail, hub_resolved_at')
    .eq('tour_id', currentShow.tour_id)
    .lt('date', currentShow.date)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (priorShow?.hub_resolved_at) {
    // Prefer the airport hub; fall back to the rail station name.
    if (priorShow.transport_hub_iata) return priorShow.transport_hub_iata
    if (priorShow.transport_hub_rail) return priorShow.transport_hub_rail
  }

  // No prior show - use the person's home city as the departure point.
  const { data: personRow } = await admin
    .from('people')
    .select('contacts(home_city)')
    .eq('id', person_id)
    .single()

  // home_city is identity, on the contact.
  const homeCity = (personRow?.contacts as { home_city: string | null } | null)?.home_city ?? null
  if (!homeCity) return null

  // Geocode home_city to its nearest airport IATA. Falls back to returning
  // the city string as-is if Maps is unavailable (e.g. no API key in dev),
  // which at least surfaces the city name in the planner UI.
  const resolved = await resolveViaGoogleMaps(homeCity)
  if (resolved?.iata) return resolved.iata

  return homeCity
}

export async function resolveHub(show_id: string): Promise<HubResolution> {
  const admin = createAdminClient()

  const { data: show, error } = await admin
    .from('shows')
    .select('id, venue_name, address, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes, venue_lat, venue_lng')
    .eq('id', show_id)
    .single()

  if (error || !show) throw new Error(`Show not found: ${show_id}`)

  // A known venue is never geocoded, so it never gets coordinates: treat that
  // case as coordinate-complete on its own. Anything resolved through Maps
  // needs venue_lat/venue_lng actually stored, or the venue map block below
  // has nothing to render, which is what REE-204 found: hub resolution ran,
  // cached the hub, and threw the geocode away, so a show resolved before this
  // fix stays without a map until this branch reruns it.
  const isKnownVenue = lookupKnownVenue(show.venue_name ?? '') !== null
  const hasCoordinates = isKnownVenue || (show.venue_lat != null && show.venue_lng != null)

  // Return cached resolution only if it produced a usable hub code.
  // A prior run that yielded null/null (standardFallback) is NOT treated as
  // resolved so we retry when the TM later adds an address.
  if (show.hub_resolved_at && (show.transport_hub_iata || show.transport_hub_rail) && hasCoordinates) {
    return {
      iata: show.transport_hub_iata,
      rail: show.transport_hub_rail,
      ground_minutes: show.hub_ground_minutes ?? (
        show.transport_hub_rail && !show.transport_hub_iata ? RAIL_TRANSIT_MIN : AIRPORT_TRANSIT_MIN
      ),
    }
  }

  // Resolution: known-venue -> Maps geocode -> give up (no hub available).
  const resolved: Resolution | null =
    lookupKnownVenue(show.venue_name ?? '') ??
    (await resolveViaGoogleMaps(show.address ?? '')) ??
    null

  if (!resolved) {
    // No hub found. Do not mark as resolved so the system retries once an
    // address is added. Surface a clear error to the TM.
    throw new Error(
      'Venue hub could not be resolved. Add a full address to the show and try again.'
    )
  }

  // Cache the result on the show row. Only mark hub_resolved_at when we have
  // a usable code so empty results are always retried. The geocode, when we
  // have one, is cached alongside it: it is what the venue map block in day
  // info renders from, and it would otherwise never be stored anywhere.
  const hasCode = !!(resolved.iata || resolved.rail)
  await admin
    .from('shows')
    .update({
      transport_hub_iata: resolved.iata,
      transport_hub_rail: resolved.rail,
      hub_ground_minutes: resolved.ground_minutes,
      hub_resolved_at: hasCode ? new Date().toISOString() : null,
      ...(resolved.lat != null && resolved.lng != null
        ? { venue_lat: resolved.lat, venue_lng: resolved.lng }
        : {}),
    })
    .eq('id', show_id)

  return {
    iata: resolved.iata,
    rail: resolved.rail,
    ground_minutes: resolved.ground_minutes,
  }
}
