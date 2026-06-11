'use server'

import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { rankOptions } from '@/lib/logistics/rank'
import { AIRPORTS } from '@/lib/logistics/airports'
import { searchDuffel } from '@/lib/logistics/adapters/duffel'
import { searchTrainline } from '@/lib/logistics/adapters/trainline'
import { searchSncf } from '@/lib/logistics/adapters/sncf'
import { searchRenfe } from '@/lib/logistics/adapters/renfe'
import { searchDarwin } from '@/lib/logistics/adapters/darwin'
import {
  searchGoogleTransitCityToCity,
  searchGoogleTransit,
} from '@/lib/logistics/adapters/google-transit'
import type { GroundTransit, TravelOption } from '@/lib/logistics/types'

// Freeform travel planner, not tied to a show.
// Computes a full door-to-door journey:
//   first mile: origin city → departure hub (Google transit)
//   main leg:   hub → hub (Duffel flights + rail stubs + Google transit)
//   last mile:  destination hub → destination place (Google transit)

export type PlanFreeformInput = {
  from_iata: string
  from_lat: number
  from_lng: number
  from_name: string   // city name as typed, used as text origin
  to_iata: string
  to_lat: number
  to_lng: number
  to_name: string
  date: string        // YYYY-MM-DD
}

const CACHE_TTL_SECONDS = 300
const CACHE_VERSION = 'freeform-v3'

const TRANSIT_MIN = 45  // hub egress buffer

export async function planFreeformTravel(
  input: PlanFreeformInput
): Promise<TravelOption[]> {
  await requireUser()

  const { from_iata, to_iata, date } = input

  if (!from_iata || !to_iata || !date) {
    throw new Error('From, to, and date are all required.')
  }

  const cacheKey = `plan:${CACHE_VERSION}:${from_iata}:${to_iata}:${date}:${encodeURIComponent(input.from_name)}:${encodeURIComponent(input.to_name)}`
  try {
    const cached = await redis.get<TravelOption[]>(cacheKey)
    if (cached) return cached
  } catch {
    // Redis unavailable, proceed without cache.
  }

  const originAirport = AIRPORTS.find((a) => a.iata === from_iata)
  const destAirport = AIRPORTS.find((a) => a.iata === to_iata)

  const railParams = {
    from_station: from_iata,
    to_station: to_iata,
    depart_after: `${date}T00:00:00Z`,
    passengers: 1,
  }

  // Fan out all providers in parallel. First/last-mile transits are computed
  // once and applied to every option, they are route-level, not leg-level.
  const [
    providerResults,
    firstMileResult,
    lastMileResult,
  ] = await Promise.all([
    Promise.allSettled([
      searchDuffel({ from_iata, to_iata, date, passengers: 1, ground_min: 0 }),
      searchTrainline(railParams),
      searchSncf(railParams),
      searchRenfe(railParams),
      searchDarwin(railParams),
      // Google intercity transit, covers short-haul rail and coach routes.
      searchGoogleTransitCityToCity({
        from_lat: input.from_lat,
        from_lng: input.from_lng,
        from_name: input.from_name,
        to_lat: input.to_lat,
        to_lng: input.to_lng,
        to_name: input.to_name,
        date,
      }),
    ]),

    // First mile: origin city → departure airport/hub.
    // Depart early morning so we capture the first feasible service of the day.
    originAirport
      ? searchGoogleTransit({
          origin_lat: input.from_lat,
          origin_lng: input.from_lng,
          origin_name: input.from_name,
          dest_address: `${originAirport.name} Airport`,
          dest_lat: originAirport.lat,
          dest_lng: originAirport.lng,
          depart_after: `${date}T06:00:00Z`,
        }).catch(() => null)
      : Promise.resolve(null as GroundTransit | null),

    // Last mile: destination airport/hub → destination place.
    // Use mid-afternoon as a representative arrival time estimate.
    destAirport
      ? searchGoogleTransit({
          origin_lat: destAirport.lat,
          origin_lng: destAirport.lng,
          origin_name: `${destAirport.name} Airport`,
          dest_address: input.to_name,
          dest_lat: input.to_lat,
          dest_lng: input.to_lng,
          depart_after: `${date}T14:00:00Z`,
        }).catch(() => null)
      : Promise.resolve(null as GroundTransit | null),
  ])

  const firstMileTransit = firstMileResult
  const lastMileTransit = lastMileResult

  const raw: TravelOption[] = providerResults.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  )

  // Attach first/last-mile transits to every option and compute door_to_site_at.
  const withMiles: TravelOption[] = raw.map((opt) => {
    const isGoogleCityToCity =
      typeof opt.raw === 'object' &&
      opt.raw !== null &&
      (opt.raw as Record<string, unknown>).provider === 'google-transit'

    // For Google city-to-city results, the route already covers origin→destination
    // so no separate first/last mile needed, the option IS the full route.
    if (isGoogleCityToCity) {
      return {
        ...opt,
        first_mile_transit: null,
        ground_transit: null,
      }
    }

    const lastMileDurationMin = lastMileTransit?.duration_min ?? 0
    const arriveAtMs = new Date(opt.arrive_at).getTime()
    const doorToSiteMs = arriveAtMs + (TRANSIT_MIN + lastMileDurationMin) * 60_000
    const doorToSiteAt = new Date(doorToSiteMs).toISOString()

    return {
      ...opt,
      transit_min: TRANSIT_MIN,
      ground_min: lastMileDurationMin,
      door_to_site_at: doorToSiteAt,
      feasible: true,
      first_mile_transit: firstMileTransit ?? null,
      ground_transit: lastMileTransit ?? null,
    }
  })

  const ranked = rankOptions(withMiles)

  if (ranked.length > 0) {
    try {
      await redis.set(cacheKey, ranked, { ex: CACHE_TTL_SECONDS })
    } catch {
      // Redis unavailable, skip caching.
    }
  }

  return ranked
}
