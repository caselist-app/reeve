import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { geocodeAddress } from '@/lib/logistics/geocode'

// REE-216. resolveHub and resolveHotelGeocode both call geocodeAddress, and a
// missing GOOGLE_MAPS_API_KEY (set only in Vercel, not in the Trigger.dev
// environment where the resolve-hub job actually runs) made it return null
// exactly like a bad address or a zero-result geocode, with nothing to tell
// the two apart. This pins the call itself: no key means no network call and
// a clean null, so a misconfigured environment fails predictably rather than
// leaving a show stuck looking like it is "still resolving".
describe('geocodeAddress', () => {
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY
  const originalFetch = global.fetch

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
  })

  afterEach(() => {
    global.fetch = originalFetch
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey
    vi.restoreAllMocks()
  })

  function mockFetchOnce(body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch
  }

  it('returns null and makes no request when GOOGLE_MAPS_API_KEY is unset', async () => {
    delete process.env.GOOGLE_MAPS_API_KEY
    global.fetch = vi.fn()

    const result = await geocodeAddress('1 Elm Street, Springfield')

    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns null and makes no request for an empty address', async () => {
    global.fetch = vi.fn()

    const result = await geocodeAddress('')

    expect(result).toBeNull()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('returns lat/lng from a successful geocode', async () => {
    mockFetchOnce({
      status: 'OK',
      results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
    })

    const result = await geocodeAddress('1 Elm Street, Springfield')

    expect(result).toEqual({ lat: 51.5074, lng: -0.1278 })
  })

  it('returns null when the geocode finds no results', async () => {
    mockFetchOnce({ status: 'ZERO_RESULTS', results: [] })

    const result = await geocodeAddress('not a real place')

    expect(result).toBeNull()
  })

  it('returns null when the request status is not OK', async () => {
    mockFetchOnce({ status: 'REQUEST_DENIED', results: [] })

    const result = await geocodeAddress('1 Elm Street, Springfield')

    expect(result).toBeNull()
  })

  it('returns null when fetch itself throws, rather than throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    const result = await geocodeAddress('1 Elm Street, Springfield')

    expect(result).toBeNull()
  })
})
