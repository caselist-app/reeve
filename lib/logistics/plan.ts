'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { getFromHub, AIRPORT_TRANSIT_MIN } from '@/lib/logistics/hub-resolver'
import { rankOptions } from '@/lib/logistics/rank'
import { searchDuffel } from '@/lib/logistics/adapters/duffel'
import { searchTrainline } from '@/lib/logistics/adapters/trainline'
import { searchSncf } from '@/lib/logistics/adapters/sncf'
import { searchRenfe } from '@/lib/logistics/adapters/renfe'
import { searchDarwin } from '@/lib/logistics/adapters/darwin'
import type { TravelOption, PlanTravelInput } from '@/lib/logistics/types'

// Cache TTL for provider results. Availability is volatile so keep short.
const CACHE_TTL_SECONDS = 300

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export async function planTravel(
  input: PlanTravelInput
): Promise<TravelOption[]> {
  await requireUser()

  const admin = createAdminClient()

  // Read the show and its cached hub resolution. Never call resolveHub() here —
  // hub resolution runs in a background job. If hub_resolved_at is null the
  // venue has not been resolved yet; surface a clear error to the TM.
  const { data: show } = await admin
    .from('shows')
    .select('tour_id, date, load_in_at, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes')
    .eq('id', input.show_id)
    .single()

  if (!show) throw new Error('Show not found.')

  if (!show.hub_resolved_at) {
    throw new Error('Venue hub not yet resolved. Try again in a moment.')
  }

  const toHub = show.transport_hub_iata ?? show.transport_hub_rail
  if (!toHub) throw new Error('Venue hub resolved but no hub code found.')

  const groundMin = show.hub_ground_minutes ?? AIRPORT_TRANSIT_MIN

  // Departure hub: prior show hub, or person home city (V1 seam for geocoding).
  const fromHub = await getFromHub(input.person_id, input.show_id)
  if (!fromHub) {
    throw new Error(
      'Set a home city for this person or ensure the prior show has a resolved hub.'
    )
  }

  const showDate = show.date

  // Check Redis cache before hitting providers. Redis is a performance layer —
  // if unavailable, fall through and call providers directly.
  const cacheKey = `plan:${fromHub}:${toHub}:${showDate}`
  try {
    const cached = await redis.get<TravelOption[]>(cacheKey)
    if (cached) return cached
  } catch {
    // Redis unavailable — proceed without cache.
  }

  // required_site_arrival: load-in minus ground transfer and airport buffer.
  // Conservative by design; the TM may knowingly accept a tighter option.
  const requiredSiteArrival = show.load_in_at
    ? addMinutes(show.load_in_at, -(groundMin + AIRPORT_TRANSIT_MIN))
    : null

  const railParams = {
    from_station: fromHub,
    to_station: toHub,
    depart_after: `${showDate}T00:00:00Z`,
    passengers: 1,
  }

  // Fan out to all providers in parallel. A failed adapter is discarded —
  // it never crashes the plan for the other providers.
  const results = await Promise.allSettled([
    searchDuffel({ from_iata: fromHub, to_iata: toHub, date: showDate, passengers: 1 }),
    searchTrainline(railParams),
    searchSncf(railParams),
    searchRenfe(railParams),
    searchDarwin(railParams),
  ])

  const raw: TravelOption[] = results.flatMap((r) =>
    r.status === 'fulfilled' ? r.value : []
  )

  // Compute door_to_site_at and feasibility centrally after collecting results.
  // Adapters do not know required_site_arrival at call time.
  const withFeasibility: TravelOption[] = raw.map((opt) => {
    const door_to_site_at = addMinutes(opt.arrive_at, opt.transit_min + opt.ground_min)
    const feasible = requiredSiteArrival
      ? new Date(door_to_site_at) <= new Date(requiredSiteArrival)
      : true
    return { ...opt, door_to_site_at, feasible }
  })

  const ranked = rankOptions(withFeasibility)

  // Only cache when we have results to avoid poisoning the cache on a bad run.
  if (ranked.length > 0) {
    try {
      await redis.set(cacheKey, ranked, { ex: CACHE_TTL_SECONDS })
    } catch {
      // Redis unavailable — skip caching.
    }
  }

  return ranked
}
