'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { resolveHub } from '@/lib/logistics/hub-resolver'
import { searchDuffel } from '@/lib/logistics/adapters/duffel'
import { searchTrainline } from '@/lib/logistics/adapters/trainline'
import { searchSncf } from '@/lib/logistics/adapters/sncf'
import { searchRenfe } from '@/lib/logistics/adapters/renfe'
import { searchDarwin } from '@/lib/logistics/adapters/darwin'
import type { TravelOption, PlanTravelInput } from '@/lib/logistics/types'

// Cache TTL for provider results. Availability is volatile so keep short.
const CACHE_TTL_SECONDS = 180

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

function computeDoorToSite(option: Omit<TravelOption, 'door_to_site_at' | 'feasible'>): string {
  return addMinutes(option.arrive_at, option.transit_min + option.ground_min)
}

// Ranking rule: feasible options first, then by door_to_site_at ascending.
// Infeasible options are always included and flagged - never dropped.
// Never rank by price (V1).
function rankOptions(options: TravelOption[]): TravelOption[] {
  return [...options].sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1
    return new Date(a.door_to_site_at).getTime() - new Date(b.door_to_site_at).getTime()
  })
}

async function resolveFromHub(
  person_id: string,
  show_id: string,
  admin: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  // Find the show before this one on the tour to determine where the person
  // is travelling from. If this is the first show, fall back to home_city.
  const { data: show } = await admin
    .from('shows')
    .select('tour_id, date')
    .eq('id', show_id)
    .single()

  if (!show) return null

  const { data: prevShow } = await admin
    .from('shows')
    .select('transport_hub_iata, transport_hub_rail, venue_name')
    .eq('tour_id', show.tour_id)
    .lt('date', show.date)
    .order('date', { ascending: false })
    .limit(1)
    .single()

  if (prevShow?.transport_hub_iata) return prevShow.transport_hub_iata
  if (prevShow?.transport_hub_rail) return prevShow.transport_hub_rail

  const { data: person } = await admin
    .from('people')
    .select('home_city')
    .eq('id', person_id)
    .single()

  return person?.home_city ?? null
}

export async function planTravel(
  input: PlanTravelInput
): Promise<TravelOption[]> {
  await requireUser()

  const admin = createAdminClient()

  const { data: show } = await admin
    .from('shows')
    .select('id, tour_id, date, load_in_at')
    .eq('id', input.show_id)
    .single()

  if (!show) throw new Error('Show not found')

  // Resolve hubs.
  const [fromHub, toHubData] = await Promise.all([
    resolveFromHub(input.person_id, input.show_id, admin),
    resolveHub(input.show_id),
  ])

  if (!fromHub) throw new Error('Cannot determine origin hub for this person')

  const toHub = toHubData.iata ?? toHubData.rail
  if (!toHub) throw new Error('Cannot determine destination hub for this show')

  const showDate = show.date

  // Check Redis cache before calling providers.
  const cacheKey = `plan:${fromHub}:${toHub}:${showDate}`
  const cached = await redis.get<TravelOption[]>(cacheKey)
  if (cached) return cached

  // Required site arrival: load-in minus the hub buffers.
  const requiredSiteArrival = show.load_in_at
    ? addMinutes(show.load_in_at, -(toHubData.ground_minutes + 45))
    : null

  // Fan out to providers in parallel. Each returns normalised TravelOption[].
  const adapterParams = {
    from_iata: fromHub,
    to_iata: toHub,
    date: showDate,
    passengers: 1,
    from_station: fromHub,
    to_station: toHub,
    depart_after: `${showDate}T00:00:00Z`,
  }

  const [flights, euRail, frRail, esRail, ukRail] = await Promise.allSettled([
    searchDuffel({ from_iata: fromHub, to_iata: toHub, date: showDate, passengers: 1 }),
    searchTrainline({ from_station: fromHub, to_station: toHub, depart_after: `${showDate}T00:00:00Z`, passengers: 1 }),
    searchSncf({ from_station: fromHub, to_station: toHub, depart_after: `${showDate}T00:00:00Z`, passengers: 1 }),
    searchRenfe({ from_station: fromHub, to_station: toHub, depart_after: `${showDate}T00:00:00Z`, passengers: 1 }),
    searchDarwin({ from_station: fromHub, to_station: toHub, depart_after: `${showDate}T00:00:00Z`, passengers: 1 }),
  ])

  const allOptions: TravelOption[] = [
    ...(flights.status === 'fulfilled' ? flights.value : []),
    ...(euRail.status === 'fulfilled' ? euRail.value : []),
    ...(frRail.status === 'fulfilled' ? frRail.value : []),
    ...(esRail.status === 'fulfilled' ? esRail.value : []),
    ...(ukRail.status === 'fulfilled' ? ukRail.value : []),
  ]

  // Compute door_to_site_at and feasibility for each option.
  const withFeasibility: TravelOption[] = allOptions.map((opt) => {
    const door_to_site_at = computeDoorToSite(opt)
    const feasible = requiredSiteArrival
      ? new Date(door_to_site_at) <= new Date(requiredSiteArrival)
      : true
    return { ...opt, door_to_site_at, feasible }
  })

  const ranked = rankOptions(withFeasibility)

  // Cache the ranked results briefly.
  if (ranked.length > 0) {
    await redis.set(cacheKey, ranked, { ex: CACHE_TTL_SECONDS })
  }

  return ranked
}
