import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveHub } from '@/lib/logistics/hub-resolver'

// REE-204. resolveHub geocodes the venue address to find the nearest airport,
// but was discarding the lat/lng once it had the airport, so the venue map
// block in day info (which reads shows.venue_lat/venue_lng) never had
// anything to render for a show resolved through the automatic hub-resolution
// job, which is every show with an address. Only the logistics planner and
// hotel search wrote those columns, and a TM adding a show never necessarily
// opens either.
//
// supabase-js makes its own requests through the global fetch, the same one
// resolveViaGoogleMaps calls through, so a blanket global.fetch mock would
// swallow resolveHub's own read of the show too and fail every test with a
// misleading "Show not found". mockGeocodeFetch only intercepts requests to
// the Maps geocode endpoint and passes everything else, including
// supabase-js's own calls, through to the real fetch.
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

describe('resolveHub stores the geocode it already computed', () => {
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

  it('writes venue_lat/venue_lng from the Maps geocode alongside the hub', async () => {
    await testDb
      .from('shows')
      .update({ address: '1 Elm Street, Springfield' })
      .eq('id', fixture.showId)

    mockGeocodeFetch({
      status: 'OK',
      results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
    })

    const result = await resolveHub(fixture.showId)
    expect(result.iata).toBeTruthy()

    const { data: show } = await testDb
      .from('shows')
      .select('venue_lat, venue_lng')
      .eq('id', fixture.showId)
      .single()

    expect(show?.venue_lat).toBe(51.5074)
    expect(show?.venue_lng).toBe(-0.1278)
  })

  // The bug this pins: hub_resolved_at plus a hub code used to be treated as
  // fully resolved on its own, so a show resolved by the old code (hub cached,
  // coordinates thrown away) stayed without a map forever, since the job only
  // reruns on create or an address edit. This is that exact stuck state,
  // constructed directly rather than by calling the old code (which no longer
  // exists), and asserts the next resolveHub call backfills it.
  it('backfills coordinates for a show already resolved without them', async () => {
    await testDb
      .from('shows')
      .update({
        address: '1 Elm Street, Springfield',
        transport_hub_iata: 'LHR',
        hub_ground_minutes: 45,
        hub_resolved_at: new Date().toISOString(),
        venue_lat: null,
        venue_lng: null,
      })
      .eq('id', fixture.showId)

    mockGeocodeFetch({
      status: 'OK',
      results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
    })

    await resolveHub(fixture.showId)

    const { data: show } = await testDb
      .from('shows')
      .select('venue_lat, venue_lng')
      .eq('id', fixture.showId)
      .single()

    expect(show?.venue_lat).toBe(51.5074)
    expect(show?.venue_lng).toBe(-0.1278)
  })

  it('does not treat a known-venue show as missing coordinates', async () => {
    await testDb
      .from('shows')
      .update({ venue_name: 'Hellfest', address: 'Clisson, France' })
      .eq('id', fixture.showId)

    const geocodeCalls = mockGeocodeFetch({ status: 'OK', results: [] })

    const result = await resolveHub(fixture.showId)
    expect(result.iata).toBe('NTE')
    // No Maps call for a known venue, and a second resolveHub call should
    // still not make one: hasCoordinates treats "known venue" as satisfied.
    expect(geocodeCalls).toHaveLength(0)

    const second = await resolveHub(fixture.showId)
    expect(second.iata).toBe('NTE')
    expect(geocodeCalls).toHaveLength(0)
  })
})
