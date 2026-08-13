import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveHotelGeocode } from '@/lib/logistics/hotel-geocode'

// REE-206. resolveHotelGeocode is the hotel-side twin of resolveHub's geocode
// step (tests/integration/hub-resolver-venue-map.test.ts): it geocodes
// hotel_stays.address so the day info Hotel block can render the same static
// map as the Venue block.
//
// Same reason as the venue test for a scoped fetch mock rather than a blanket
// one: supabase-js makes its own requests through the global fetch, and a
// blanket mock would swallow this function's own reads and writes too.
function mockGeocodeFetch(
  response: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
) {
  const real = global.fetch
  const geocodeCalls: string[] = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://maps.googleapis.com/maps/api/geocode/json')) {
      geocodeCalls.push(url)
      return { json: async () => response } as Response
    }
    return real(input, init)
  }) as unknown as typeof fetch
  return geocodeCalls
}

describe('resolveHotelGeocode', () => {
  let fixture: Fixture
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY
  const originalFetch = global.fetch

  beforeEach(async () => {
    fixture = await createFixture()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
  })

  afterEach(async () => {
    global.fetch = originalFetch
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('writes lat/lng from the Maps geocode onto the hotel stay', async () => {
    const { data: stay, error } = await testDb
      .from('hotel_stays')
      .insert({
        tour_id: fixture.tourId,
        name: 'Ace Hotel',
        address: '100 Shoreditch High St, London',
      })
      .select('id')
      .single()
    if (error || !stay) throw new Error(error?.message ?? 'no stay created')

    mockGeocodeFetch({
      status: 'OK',
      results: [{ geometry: { location: { lat: 51.5259, lng: -0.0784 } } }],
    })

    await resolveHotelGeocode(stay.id)

    const { data: updated } = await testDb
      .from('hotel_stays')
      .select('lat, lng')
      .eq('id', stay.id)
      .single()

    expect(updated?.lat).toBe(51.5259)
    expect(updated?.lng).toBe(-0.0784)
  })

  it('leaves lat/lng null when the stay has no address', async () => {
    const { data: stay, error } = await testDb
      .from('hotel_stays')
      .insert({ tour_id: fixture.tourId, name: 'No Address Hotel' })
      .select('id')
      .single()
    if (error || !stay) throw new Error(error?.message ?? 'no stay created')

    const geocodeCalls = mockGeocodeFetch({ status: 'OK', results: [] })

    await resolveHotelGeocode(stay.id)
    expect(geocodeCalls).toHaveLength(0)

    const { data: updated } = await testDb
      .from('hotel_stays')
      .select('lat, lng')
      .eq('id', stay.id)
      .single()

    expect(updated?.lat).toBeNull()
    expect(updated?.lng).toBeNull()
  })

  it('leaves lat/lng null when the geocode finds nothing', async () => {
    const { data: stay, error } = await testDb
      .from('hotel_stays')
      .insert({
        tour_id: fixture.tourId,
        name: 'Unresolvable Hotel',
        address: 'not a real place',
      })
      .select('id')
      .single()
    if (error || !stay) throw new Error(error?.message ?? 'no stay created')

    mockGeocodeFetch({ status: 'ZERO_RESULTS', results: [] })

    await resolveHotelGeocode(stay.id)

    const { data: updated } = await testDb
      .from('hotel_stays')
      .select('lat, lng')
      .eq('id', stay.id)
      .single()

    expect(updated?.lat).toBeNull()
    expect(updated?.lng).toBeNull()
  })
})
