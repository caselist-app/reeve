import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveHub } from '@/lib/logistics/hub-resolver'

// REE-242. resolveHub already geocoded a venue to find its nearest airport;
// this makes it also resolve and cache the venue's timezone (and, for a
// geocoded show, its coordinates) so nothing downstream has to guess the
// show's local time from the tour's zone. supabase-js makes its own requests
// through the global fetch, the same one geocodeVenueTimezone calls through,
// so a blanket global.fetch mock would swallow resolveHub's own read of the
// show and fail every test with a misleading "Show not found". mockGoogleFetch
// only intercepts requests to the Geocoding and Time Zone endpoints and passes
// everything else, including supabase-js's own calls, through to the real
// fetch.
function mockGoogleFetch(opts: {
  geocode?: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  timezone?: { status: string; timeZoneId?: string }
}) {
  const real = global.fetch
  const calls: string[] = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://maps.googleapis.com/maps/api/geocode/json')) {
      calls.push('geocode')
      return { json: async () => opts.geocode } as Response
    }
    if (url.startsWith('https://maps.googleapis.com/maps/api/timezone/json')) {
      calls.push('timezone')
      return { json: async () => opts.timezone } as Response
    }
    return real(input, init)
  }) as unknown as typeof fetch
  return calls
}

describe('resolveHub resolves and caches venue timezone', () => {
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

  it('resolves a known-venue show to its hardcoded timezone with no Time Zone call', async () => {
    await testDb
      .from('shows')
      .update({ venue_name: 'Hellfest', address: 'Clisson, France' })
      .eq('id', fixture.showId)

    const calls = mockGoogleFetch({})

    const result = await resolveHub(fixture.showId)
    expect(result.iata).toBe('NTE')
    expect(calls).toHaveLength(0)

    const { data: show } = await testDb
      .from('shows')
      .select('timezone')
      .eq('id', fixture.showId)
      .single()

    expect(show?.timezone).toBe('Europe/Paris')
  })

  it('resolves a geocoded show to venue_lat, venue_lng and timezone, with no raw payload leaking past the return value', async () => {
    await testDb
      .from('shows')
      .update({ address: '1 Elm Street, Springfield' })
      .eq('id', fixture.showId)

    mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'Europe/London' },
    })

    const result = await resolveHub(fixture.showId)
    expect(result.iata).toBeTruthy()

    // The return value is the normalised HubResolution shape only: no lat,
    // lng, timezone or raw Google payload rides along on it. Those live on
    // the show row, which is what downstream code reads.
    expect(Object.keys(result).sort()).toEqual(['ground_minutes', 'iata', 'rail'])

    const { data: show } = await testDb
      .from('shows')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', fixture.showId)
      .single()

    expect(show?.venue_lat).toBe(51.5074)
    expect(show?.venue_lng).toBe(-0.1278)
    expect(show?.timezone).toBe('Europe/London')
  })

  // The bug this pins: hub_resolved_at plus a hub code plus coordinates used
  // to be treated as fully resolved on its own, so a show resolved before
  // this shipped (timezone still null) would return the stale cached row
  // forever instead of re-resolving to pick up a zone. Constructed directly
  // as that exact stuck state, the same way hub-resolver-venue-map.test.ts
  // constructs the REE-204 stuck state it pins.
  it('re-resolves fully rather than returning a cached row with no timezone', async () => {
    await testDb
      .from('shows')
      .update({
        address: '1 Elm Street, Springfield',
        transport_hub_iata: 'LHR',
        hub_ground_minutes: 45,
        hub_resolved_at: new Date().toISOString(),
        venue_lat: 51.5074,
        venue_lng: -0.1278,
        timezone: null,
      })
      .eq('id', fixture.showId)

    const calls = mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'Europe/London' },
    })

    await resolveHub(fixture.showId)

    // A stale cache-hit would never call either endpoint. This is the assertion
    // that fails before the `&& show.timezone` guard is added.
    expect(calls).toContain('timezone')

    const { data: show } = await testDb
      .from('shows')
      .select('timezone')
      .eq('id', fixture.showId)
      .single()

    expect(show?.timezone).toBe('Europe/London')
  })
})
