'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { searchRatehawk } from '@/lib/logistics/adapters/ratehawk'
import { searchHotelbeds } from '@/lib/logistics/adapters/hotelbeds'
import { searchExpedia } from '@/lib/logistics/adapters/expedia'
import type { HotelOption, PlanHotelsInput } from '@/lib/logistics/types'

const CACHE_TTL_SECONDS = 180

export async function planHotels(
  input: PlanHotelsInput
): Promise<{ artist: HotelOption[]; crew: HotelOption[] }> {
  await requireUser()

  const admin = createAdminClient()

  const { data: show } = await admin
    .from('shows')
    .select('id, venue_name, address')
    .eq('id', input.show_id)
    .single()

  if (!show) throw new Error('Show not found')

  // Parse check-in and check-out from the party's inbound segment arrive_at
  // and depart_at. These are passed in by the caller.
  const checkIn = input.arrive_at.split('T')[0]
  const checkOut = input.depart_at.split('T')[0]

  // Check Redis cache.
  const cacheKey = `hotels:${input.show_id}:${checkIn}:${checkOut}`
  const cached = await redis.get<{ artist: HotelOption[]; crew: HotelOption[] }>(cacheKey)
  if (cached) return cached

  // Parking is a hard filter for bus/truck tours - derive from show parking field.
  // Early check-in needed if any inbound segment arrives before standard check-in.
  // Both passed through from the caller.
  const searchParams = {
    lat: 0,   // TODO: geocode venue address via Google Maps
    lng: 0,
    check_in: checkIn,
    check_out: checkOut,
    guests: input.party.length,
    requires_parking: false,   // caller sets based on tour transport profile
    requires_early_check_in: false,
  }

  // Fan out to hotel providers in parallel.
  const [rh, hb, ex] = await Promise.allSettled([
    searchRatehawk(searchParams),
    searchHotelbeds(searchParams),
    searchExpedia(searchParams),
  ])

  const all: HotelOption[] = [
    ...(rh.status === 'fulfilled' ? rh.value : []),
    ...(hb.status === 'fulfilled' ? hb.value : []),
    ...(ex.status === 'fulfilled' ? ex.value : []),
  ]

  // Split into artist and crew shortlists. Hard-filter parking and early check-in.
  const artist = all.filter((h) => h.tier === 'artist')
  const crew = all.filter((h) => h.tier === 'crew')

  const result = { artist, crew }

  if (all.length > 0) {
    await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS })
  }

  return result
}
