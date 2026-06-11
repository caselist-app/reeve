'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { getFromHub } from '@/lib/logistics/hub-resolver'
import { AIRPORT_TRANSIT_MIN } from '@/lib/logistics/constants'
import { rankOptions } from '@/lib/logistics/rank'
import { searchDuffel } from '@/lib/logistics/adapters/duffel'
import { searchTrainline } from '@/lib/logistics/adapters/trainline'
import { searchSncf } from '@/lib/logistics/adapters/sncf'
import { searchRenfe } from '@/lib/logistics/adapters/renfe'
import { searchDarwin } from '@/lib/logistics/adapters/darwin'
import { searchGoogleTransit } from '@/lib/logistics/adapters/google-transit'
import { AIRPORTS } from '@/lib/logistics/airports'
import type { TravelOption, PlanTravelInput } from '@/lib/logistics/types'

// Cache TTL for provider results. Availability is volatile so keep short.
const CACHE_TTL_SECONDS = 300
// Bump when the TravelOption shape changes so stale cached entries are ignored.
const CACHE_VERSION = 'v6'

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

// Bucket an ISO timestamp by hour, used to group flight arrivals so we query
// Google Transit once per hour bucket rather than once per flight.
function hourBucket(iso: string): string {
  return iso.slice(0, 13) // "YYYY-MM-DDTHH"
}

export async function planTravel(
  input: PlanTravelInput
): Promise<TravelOption[]> {
  await requireUser()

  const admin = createAdminClient()

  // Read the show and its cached hub resolution. Never call resolveHub() here, 
  // hub resolution runs in a background job. If hub_resolved_at is null the
  // venue has not been resolved yet; surface a clear error to the TM.
  const { data: show } = await admin
    .from('shows')
    .select('tour_id, date, load_in_at, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes, address, venue_lat, venue_lng')
    .eq('id', input.show_id)
    .single()

  if (!show) throw new Error('Show not found.')

  if (!show.hub_resolved_at) {
    throw new Error('Venue hub not yet resolved. Try again in a moment.')
  }

  const toHub = show.transport_hub_iata ?? show.transport_hub_rail
  if (!toHub) throw new Error('Venue hub resolved but no hub code found.')

  const groundMin = show.hub_ground_minutes ?? AIRPORT_TRANSIT_MIN

  // Departure hub: TM override takes priority, then prior show hub, then home city.
  const fromHub = input.from_override ?? await getFromHub(input.person_id, input.show_id)
  if (!fromHub) {
    throw new Error(
      'Set a home city for this person or ensure the prior show has a resolved hub.'
    )
  }

  // date_override allows searching a different date (e.g. day before) without
  // changing the show's hub or ground transfer data.
  const searchDate = input.date_override ?? show.date

  // Check Redis cache before hitting providers. Redis is a performance layer, 
  // if unavailable, fall through and call providers directly.
  const cacheKey = `plan:${CACHE_VERSION}:${fromHub}:${toHub}:${searchDate}`
  try {
    const cached = await redis.get<TravelOption[]>(cacheKey)
    if (cached) return cached
  } catch {
    // Redis unavailable, proceed without cache.
  }

  // required_site_arrival: load-in is when crew must be on site.
  // door_to_site_at (arrive_at + transit + ground) is compared directly against
  // this, so do not subtract transit time here or it gets counted twice.
  const requiredSiteArrival = show.load_in_at ?? null

  const railParams = {
    from_station: fromHub,
    to_station: toHub,
    depart_after: `${searchDate}T00:00:00Z`,
    passengers: 1,
  }

  // Fan out to all providers in parallel. A failed adapter is discarded, 
  // it never crashes the plan for the other providers.
  const providerResults = await Promise.allSettled([
    searchDuffel({ from_iata: fromHub, to_iata: toHub, date: searchDate, passengers: 1, ground_min: groundMin }),
    searchTrainline(railParams),
    searchSncf(railParams),
    searchRenfe(railParams),
    searchDarwin(railParams),
  ])

  const raw: TravelOption[] = providerResults.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  )

  // ── Ground transit enrichment ──────────────────────────────────────────────
  // For each flight, the ground leg starts when the person exits the hub
  // (arrive_at + transit_min). We query Google Directions (transit mode) to
  // get real steps: walk to station, wait, board train/bus, arrive at venue.
  // We group by arrival-hour to cap Google API calls (one per hour bucket).
  const hubAirport = show.transport_hub_iata
    ? AIRPORTS.find((a) => a.iata === show.transport_hub_iata)
    : null

  const venueAddress = show.address ?? ''

  // Ensure venue coordinates are available for the transit adapter.
  // Hub resolution geocodes to find the nearest airport but does not store
  // venue lat/lng. Geocode once here and cache on the show row.
  let venueLat = show.venue_lat
  let venueLng = show.venue_lng

  if ((venueLat == null || venueLng == null) && venueAddress) {
    const mapsKey = process.env.GOOGLE_MAPS_API_KEY
    if (mapsKey) {
      try {
        const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(venueAddress)}&key=${mapsKey}`
        const geoRes = await fetch(geoUrl)
        const geoData = await geoRes.json() as { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
        if (geoData.status === 'OK' && geoData.results[0]) {
          venueLat = geoData.results[0].geometry.location.lat
          venueLng = geoData.results[0].geometry.location.lng
          // Cache on the show row so subsequent plan runs skip this step.
          await admin.from('shows').update({ venue_lat: venueLat, venue_lng: venueLng }).eq('id', input.show_id)
        }
      } catch {
        // Non-fatal, fall back to address-based destination below.
      }
    }
  }

  const hasVenueLocation = venueAddress || (venueLat != null && venueLng != null)

  // Map: hour bucket → GroundTransit | null
  const groundTransitCache = new Map<string, Awaited<ReturnType<typeof searchGoogleTransit>>>()

  if (hubAirport && hasVenueLocation) {
    // Collect unique hour buckets across all options.
    const buckets = new Map<string, string>() // bucket → representative depart_after ISO
    for (const opt of raw) {
      const hubExitAt = addMinutes(opt.arrive_at, opt.transit_min)
      const bucket = hourBucket(hubExitAt)
      if (!buckets.has(bucket)) buckets.set(bucket, hubExitAt)
    }

    // Query Google once per bucket, run concurrently, failures are silently dropped.
    const transitQueries = Array.from(buckets.entries()).map(async ([bucket, departAfter]) => {
      const result = await searchGoogleTransit({
        origin_lat: hubAirport.lat,
        origin_lng: hubAirport.lng,
        // Use the airport name as the origin text. Named places resolve transit
        // connections (e.g. metro from terminal) more reliably than raw coordinates.
        // Appending "Airport" helps Google's geocoder disambiguate from city names.
        origin_name: hubAirport.name ? `${hubAirport.name} Airport` : null,
        dest_address: venueAddress,
        dest_lat: venueLat,
        dest_lng: venueLng,
        depart_after: departAfter,
      })
      groundTransitCache.set(bucket, result)
    })
    // Non-fatal: if Google is down, fall back to car estimate.
    await Promise.allSettled(transitQueries)
  }

  // ── Compute door_to_site_at and feasibility ────────────────────────────────
  const withFeasibility: TravelOption[] = raw.map((opt) => {
    const hubExitAt = addMinutes(opt.arrive_at, opt.transit_min)
    const bucket = hourBucket(hubExitAt)
    const groundTransit = groundTransitCache.get(bucket) ?? null

    // If we have real transit data, use its arrival time as the site arrival.
    // Otherwise fall back to the static car estimate.
    const door_to_site_at = groundTransit
      ? groundTransit.arrive_at
      : addMinutes(opt.arrive_at, opt.transit_min + opt.ground_min)

    const effectiveGroundMin = groundTransit
      ? groundTransit.duration_min
      : opt.ground_min

    const feasible = requiredSiteArrival
      ? new Date(door_to_site_at) <= new Date(requiredSiteArrival)
      : true

    return {
      ...opt,
      ground_min: effectiveGroundMin,
      ground_transit: groundTransit ?? null,
      door_to_site_at,
      feasible,
    }
  })

  const ranked = rankOptions(withFeasibility)

  // Only cache when we have results to avoid poisoning the cache on a bad run.
  if (ranked.length > 0) {
    try {
      await redis.set(cacheKey, ranked, { ex: CACHE_TTL_SECONDS })
    } catch {
      // Redis unavailable, skip caching.
    }
  }

  return ranked
}
