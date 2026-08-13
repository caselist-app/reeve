import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { fetchOpenMeteoWeather } from '@/lib/logistics/adapters/open-meteo'
import fixture from '../fixtures/open-meteo-response.json'

describe('fetchOpenMeteoWeather', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  function mockFetchOnce(body: unknown, ok = true) {
    global.fetch = vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch
  }

  it('normalises a real recorded response to tempC and code', async () => {
    mockFetchOnce(fixture)

    const result = await fetchOpenMeteoWeather(51.5072, -0.1276)

    expect(result).toEqual({ tempC: 32.0, code: 0 })
  })

  it('never leaks other fields from the raw payload', async () => {
    mockFetchOnce(fixture)

    const result = await fetchOpenMeteoWeather(51.5072, -0.1276)

    expect(result).not.toBeNull()
    expect(Object.keys(result!).sort()).toEqual(['code', 'tempC'])
    expect(result).not.toHaveProperty('relative_humidity_2m')
    expect(result).not.toHaveProperty('wind_speed_10m')
    expect(result).not.toHaveProperty('is_day')
    expect(result).not.toHaveProperty('raw')
  })

  it('returns null when the response has no current block', async () => {
    mockFetchOnce({ latitude: 51.5, longitude: -0.1 })

    const result = await fetchOpenMeteoWeather(51.5, -0.1)

    expect(result).toBeNull()
  })

  it('returns null when the current block is missing required fields', async () => {
    mockFetchOnce({ current: { weather_code: 0 } })

    const result = await fetchOpenMeteoWeather(51.5, -0.1)

    expect(result).toBeNull()
  })

  it('returns null on an HTTP error response rather than throwing', async () => {
    mockFetchOnce({ error: true, reason: 'Latitude must be in range of -90 to 90°' }, false)

    const result = await fetchOpenMeteoWeather(999, -0.1)

    expect(result).toBeNull()
  })

  it('returns null when fetch itself throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    const result = await fetchOpenMeteoWeather(51.5, -0.1)

    expect(result).toBeNull()
  })

  it('returns null on malformed JSON rather than throwing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.reject(new Error('invalid json')),
    }) as unknown as typeof fetch

    const result = await fetchOpenMeteoWeather(51.5, -0.1)

    expect(result).toBeNull()
  })
})
