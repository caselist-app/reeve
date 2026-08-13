import { describe, it, expect, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveShowWeather } from '@/lib/schedule/venue-weather'

// REE-185. resolveShowWeather is the day info weather block's one lookup:
// read the cache, refetch through Open-Meteo only when it is missing or more
// than three hours old and the show has coordinates, write the refreshed
// values back best-effort. It never geocodes on its own: venue_lat/venue_lng
// come from hub resolution or the planner, so null coordinates is a null
// result with no adapter call at all.
//
// supabase-js makes its own requests through the global fetch, the same one
// fetchOpenMeteoWeather calls through, so mockWeatherFetch only intercepts
// requests to the Open-Meteo endpoint and passes everything else, including
// supabase-js's own calls, through to the real fetch. Mirrors
// hub-resolver-venue-map.test.ts's mockGeocodeFetch.
function mockWeatherFetch(response: { current: { temperature_2m: number; weather_code: number } }) {
  const real = global.fetch
  const calls: string[] = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://api.open-meteo.com/v1/forecast')) {
      calls.push(url)
      return { ok: true, json: async () => response } as Response
    }
    return real(input, init)
  }) as unknown as typeof fetch
  return calls
}

const LAT = 51.5074
const LNG = -0.1278

describe('resolveShowWeather', () => {
  let fixture: Fixture
  const originalFetch = global.fetch

  afterEach(async () => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('fetches and caches weather for a show with coordinates and no cached weather', async () => {
    fixture = await createFixture()
    await testDb
      .from('shows')
      .update({ venue_lat: LAT, venue_lng: LNG })
      .eq('id', fixture.showId)

    const calls = mockWeatherFetch({ current: { temperature_2m: 18.4, weather_code: 3 } })

    const weather = await resolveShowWeather(testDb, fixture.showId)

    expect(calls).toHaveLength(1)
    expect(weather).toEqual({ tempC: 18.4, code: 3 })

    const { data: show } = await testDb
      .from('shows')
      .select('weather_temp_c, weather_code, weather_fetched_at')
      .eq('id', fixture.showId)
      .single()

    expect(show?.weather_temp_c).toBe(18.4)
    expect(show?.weather_code).toBe(3)
    expect(show?.weather_fetched_at).not.toBeNull()
  })

  it('does not refetch when the cached weather is under three hours old', async () => {
    fixture = await createFixture()
    const fetchedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
    await testDb
      .from('shows')
      .update({
        venue_lat: LAT,
        venue_lng: LNG,
        weather_temp_c: 12,
        weather_code: 1,
        weather_fetched_at: fetchedAt,
      })
      .eq('id', fixture.showId)

    const calls = mockWeatherFetch({ current: { temperature_2m: 99, weather_code: 99 } })

    const weather = await resolveShowWeather(testDb, fixture.showId)

    expect(calls).toHaveLength(0)
    expect(weather).toEqual({ tempC: 12, code: 1 })
  })

  it('refetches when the cached weather is more than three hours old', async () => {
    fixture = await createFixture()
    const fetchedAt = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString() // 4 hours ago
    await testDb
      .from('shows')
      .update({
        venue_lat: LAT,
        venue_lng: LNG,
        weather_temp_c: 12,
        weather_code: 1,
        weather_fetched_at: fetchedAt,
      })
      .eq('id', fixture.showId)

    const calls = mockWeatherFetch({ current: { temperature_2m: 22.1, weather_code: 61 } })

    const weather = await resolveShowWeather(testDb, fixture.showId)

    expect(calls).toHaveLength(1)
    expect(weather).toEqual({ tempC: 22.1, code: 61 })

    const { data: show } = await testDb
      .from('shows')
      .select('weather_temp_c, weather_code')
      .eq('id', fixture.showId)
      .single()

    expect(show?.weather_temp_c).toBe(22.1)
    expect(show?.weather_code).toBe(61)
  })

  it('returns null and never calls the adapter when coordinates are missing', async () => {
    fixture = await createFixture()
    // createFixture leaves venue_lat/venue_lng unset, but be explicit: this is
    // the case under test, not an assumption about the fixture's defaults.
    await testDb
      .from('shows')
      .update({ venue_lat: null, venue_lng: null })
      .eq('id', fixture.showId)

    const calls = mockWeatherFetch({ current: { temperature_2m: 18.4, weather_code: 3 } })

    const weather = await resolveShowWeather(testDb, fixture.showId)

    expect(weather).toBeNull()
    expect(calls).toHaveLength(0)

    const { data: show } = await testDb
      .from('shows')
      .select('weather_temp_c, weather_code, weather_fetched_at')
      .eq('id', fixture.showId)
      .single()

    expect(show?.weather_temp_c).toBeNull()
    expect(show?.weather_code).toBeNull()
    expect(show?.weather_fetched_at).toBeNull()
  })
})
