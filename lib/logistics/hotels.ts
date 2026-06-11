'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { redis } from '@/lib/redis'
import { searchRatehawk } from '@/lib/logistics/adapters/ratehawk'
import { searchHotelbeds } from '@/lib/logistics/adapters/hotelbeds'
import { searchExpedia } from '@/lib/logistics/adapters/expedia'
import { searchMockHotels } from '@/lib/logistics/adapters/mock-hotels'
import type { HotelOption, PlanHotelsInput } from '@/lib/logistics/types'

// Cache TTL for hotel results. Availability is less volatile than flights.
const CACHE_TTL_SECONDS = 900

// Search radius around the venue in kilometres.
const SEARCH_RADIUS_KM = 10

// Maximum results per tier shown to the TM.
const MAX_RESULTS_PER_TIER = 5

// Geocodes a venue address via the Maps Geocoding API and caches the result
// on the show row. Re-geocodes only when called with a new address.
async function geocodeVenue(
  showId: string,
  address: string | null
): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY
  if (!apiKey || !address) return null

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`

  let data: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  try {
    const res = await fetch(url)
    data = await res.json() as typeof data
  } catch {
    return null
  }

  if (data.status !== 'OK' || !data.results[0]) return null

  const { lat, lng } = data.results[0].geometry.location

  // Cache on the show row so subsequent calls skip the API.
  const admin = createAdminClient()
  await admin.from('shows').update({ venue_lat: lat, venue_lng: lng }).eq('id', showId)

  return { lat, lng }
}

export async function planHotels(
  input: PlanHotelsInput
): Promise<{ artist: HotelOption[]; crew: HotelOption[] }> {
  await requireUser()

  const admin = createAdminClient()

  // Read show including any cached geocode. Never re-geocode on every call.
  const { data: show } = await admin
    .from('shows')
    .select('id, venue_name, address, venue_lat, venue_lng, date')
    .eq('id', input.show_id)
    .single()

  if (!show) throw new Error('Show not found.')

  // Resolve geocode: cached on show row first, then Maps seam, then fail gracefully.
  let lat = show.venue_lat
  let lng = show.venue_lng

  if (lat == null || lng == null) {
    const geocoded = await geocodeVenue(show.id, show.address)
    if (geocoded) {
      lat = geocoded.lat
      lng = geocoded.lng
      // Cache on the show row.
      await admin
        .from('shows')
        .update({ venue_lat: lat, venue_lng: lng })
        .eq('id', show.id)
    }
  }

  if (lat == null || lng == null) {
    throw new Error(
      'Venue location not yet resolved. Add an address to the show to enable hotel search.'
    )
  }

  // Derive check-in / check-out dates from arrive_at / depart_at.
  // Fall back to the show date if not provided.
  const checkInDate = input.arrive_at
    ? input.arrive_at.split('T')[0]
    : show.date
  const checkOutDate = input.depart_at
    ? input.depart_at.split('T')[0]
    : checkInDate

  // Redis cache keyed by show, dates, and party counts.
  const cacheKey = `hotels:${input.show_id}:${checkInDate}:${input.party.crew_count}:${input.party.artist_count}`
  try {
    const cached = await redis.get<{ artist: HotelOption[]; crew: HotelOption[] }>(cacheKey)
    if (cached) return cached
  } catch {
    // Redis unavailable, proceed without cache.
  }

  const baseParams = {
    lat,
    lng,
    radius_km: SEARCH_RADIUS_KM,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    arrive_at: input.arrive_at,
    depart_at: input.depart_at,
    parking_required: input.party.parking_required,
  }

  // Fan out artist and crew searches in parallel across all providers.
  // A failed adapter is discarded, never crashes the plan.
  const [rhArtist, rhCrew, hbArtist, hbCrew, exArtist, exCrew] =
    await Promise.allSettled([
      searchRatehawk({ ...baseParams, rooms: input.party.artist_count, tier: 'artist' }),
      searchRatehawk({ ...baseParams, rooms: input.party.crew_count, tier: 'crew' }),
      searchHotelbeds({ ...baseParams, rooms: input.party.artist_count, tier: 'artist' }),
      searchHotelbeds({ ...baseParams, rooms: input.party.crew_count, tier: 'crew' }),
      searchExpedia({ ...baseParams, rooms: input.party.artist_count, tier: 'artist' }),
      searchExpedia({ ...baseParams, rooms: input.party.crew_count, tier: 'crew' }),
    ])

  const artistRaw: HotelOption[] = [
    ...(rhArtist.status === 'fulfilled' ? rhArtist.value : []),
    ...(hbArtist.status === 'fulfilled' ? hbArtist.value : []),
    ...(exArtist.status === 'fulfilled' ? exArtist.value : []),
  ]

  const crewRaw: HotelOption[] = [
    ...(rhCrew.status === 'fulfilled' ? rhCrew.value : []),
    ...(hbCrew.status === 'fulfilled' ? hbCrew.value : []),
    ...(exCrew.status === 'fulfilled' ? exCrew.value : []),
  ]

  // When no real provider returns results, fall back to mock data only if
  // ENABLE_MOCK_HOTELS=true. This keeps demo mode explicit and prevents a TM
  // from accidentally recording a fabricated hotel as real tour data.
  // Remove once a real hotel adapter is wired up and deployed.
  if (artistRaw.length === 0 && crewRaw.length === 0 && process.env.ENABLE_MOCK_HOTELS === 'true') {
    const [mockArtist, mockCrew] = await Promise.all([
      searchMockHotels({ ...baseParams, rooms: input.party.artist_count, tier: 'artist' }),
      searchMockHotels({ ...baseParams, rooms: input.party.crew_count, tier: 'crew' }),
    ])
    artistRaw.push(...mockArtist)
    crewRaw.push(...mockCrew)
  }

  // Parking is a HARD filter for bus/truck tours, a property without a truck
  // bay is not an option, not a down-ranked one. Strip it entirely.
  function applyFilters(options: HotelOption[]): HotelOption[] {
    let filtered = options
    if (input.party.parking_required) {
      filtered = filtered.filter((h) => h.parking_ok)
    }
    return filtered.slice(0, MAX_RESULTS_PER_TIER)
  }

  const result = {
    artist: applyFilters(artistRaw),
    crew: applyFilters(crewRaw),
  }

  if (artistRaw.length > 0 || crewRaw.length > 0) {
    try {
      await redis.set(cacheKey, result, { ex: CACHE_TTL_SECONDS })
    } catch {
      // Redis unavailable, skip caching.
    }
  }

  return result
}
