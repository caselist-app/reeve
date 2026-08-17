import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { searchDuffel, type DuffelSearchParams } from '@/lib/logistics/adapters/duffel'
import { AIRPORT_TRANSIT_MIN } from '@/lib/logistics/constants'

describe('searchDuffel', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.DUFFEL_API_TOKEN

  beforeEach(() => {
    process.env.DUFFEL_API_TOKEN = 'test-token'
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalToken === undefined) delete process.env.DUFFEL_API_TOKEN
    else process.env.DUFFEL_API_TOKEN = originalToken
    vi.restoreAllMocks()
  })

  const baseParams: DuffelSearchParams = {
    from_iata: 'LHR',
    to_iata: 'CDG',
    date: '2026-09-01',
    passengers: 1,
    ground_min: 30,
  }

  function mockFetchOnce(body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch
  }

  function segment(overrides: Partial<{
    departing_at: string
    arriving_at: string
    iata_code: string
    flight_number: string
    carrier_name: string
    logo_symbol_url: string | null
  }> = {}) {
    return {
      departing_at: overrides.departing_at ?? '2026-09-01T10:00:00',
      arriving_at: overrides.arriving_at ?? '2026-09-01T11:30:00',
      origin: { iata_code: 'LHR' },
      destination: { iata_code: 'CDG' },
      marketing_carrier: {
        name: overrides.carrier_name ?? 'British Airways',
        iata_code: overrides.iata_code ?? 'BA',
        logo_symbol_url: overrides.logo_symbol_url === undefined ? 'https://duffel.example/ba.png' : overrides.logo_symbol_url,
      },
      marketing_carrier_flight_number: overrides.flight_number ?? '304',
    }
  }

  function offerResponse(offers: Array<{ id: string; slices: { segments: ReturnType<typeof segment>[] }[] }>) {
    return { data: { offers } }
  }

  it('normalises a single-segment offer into a TravelOption', async () => {
    mockFetchOnce(
      offerResponse([{ id: 'off_1', slices: [{ segments: [segment()] }] }])
    )

    const result = await searchDuffel(baseParams)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      mode: 'flight',
      depart_at: '2026-09-01T10:00:00Z',
      arrive_at: '2026-09-01T11:30:00Z',
      carrier: 'British Airways',
      carrier_logo_url: 'https://duffel.example/ba.png',
      leg_ref: 'BA304',
      transit_min: AIRPORT_TRANSIT_MIN,
      ground_min: 30,
      door_to_site_at: '2026-09-01T11:30:00Z',
      feasible: true,
      book_url: 'https://www.google.com/travel/flights/search?hl=en&q=Flights+from+LHR+to+CDG+on+2026-09-01',
      ground_transit: null,
      raw: { provider: 'duffel', offer_id: 'off_1' },
    })
  })

  it('uses the first segment departure and the last segment arrival for a multi-segment slice', async () => {
    mockFetchOnce(
      offerResponse([
        {
          id: 'off_2',
          slices: [
            {
              segments: [
                segment({ departing_at: '2026-09-01T08:00:00', arriving_at: '2026-09-01T09:15:00' }),
                segment({ departing_at: '2026-09-01T10:00:00', arriving_at: '2026-09-01T12:45:00' }),
              ],
            },
          ],
        },
      ])
    )

    const result = await searchDuffel(baseParams)

    expect(result[0].depart_at).toBe('2026-09-01T08:00:00Z')
    expect(result[0].arrive_at).toBe('2026-09-01T12:45:00Z')
  })

  it('leaves a datetime with a trailing Z untouched', async () => {
    mockFetchOnce(
      offerResponse([
        { id: 'off_3', slices: [{ segments: [segment({ departing_at: '2026-09-01T10:00:00Z' })] }] },
      ])
    )

    const result = await searchDuffel(baseParams)

    expect(result[0].depart_at).toBe('2026-09-01T10:00:00Z')
  })

  it('leaves a datetime with an explicit offset untouched', async () => {
    mockFetchOnce(
      offerResponse([
        { id: 'off_4', slices: [{ segments: [segment({ departing_at: '2026-09-01T10:00:00+02:00' })] }] },
      ])
    )

    const result = await searchDuffel(baseParams)

    expect(result[0].depart_at).toBe('2026-09-01T10:00:00+02:00')
  })

  it('falls back to the Google Flights airline logo CDN when logo_symbol_url is null', async () => {
    mockFetchOnce(
      offerResponse([
        { id: 'off_5', slices: [{ segments: [segment({ logo_symbol_url: null, iata_code: 'BA' })] }] },
      ])
    )

    const result = await searchDuffel(baseParams)

    expect(result[0].carrier_logo_url).toBe('https://www.gstatic.com/flights/airline_logos/70px/BA.png')
  })

  it('returns [] and never calls fetch when DUFFEL_API_TOKEN is missing', async () => {
    delete process.env.DUFFEL_API_TOKEN
    global.fetch = vi.fn() as unknown as typeof fetch

    const result = await searchDuffel(baseParams)

    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('skips an offer whose first slice has no segments', async () => {
    mockFetchOnce(
      offerResponse([
        { id: 'off_empty', slices: [{ segments: [] }] },
        { id: 'off_good', slices: [{ segments: [segment()] }] },
      ])
    )

    const result = await searchDuffel(baseParams)

    expect(result).toHaveLength(1)
    expect((result[0].raw as { offer_id: string }).offer_id).toBe('off_good')
  })

  it('skips an offer missing a slices/segments field entirely', async () => {
    mockFetchOnce({
      data: {
        offers: [
          { id: 'off_missing', slices: [{}] },
          { id: 'off_good', slices: [{ segments: [segment()] }] },
        ],
      },
    })

    const result = await searchDuffel(baseParams)

    expect(result).toHaveLength(1)
    expect((result[0].raw as { offer_id: string }).offer_id).toBe('off_good')
  })

  it('caps the returned offers at MAX_OFFERS (20)', async () => {
    const offers = Array.from({ length: 25 }, (_, i) => ({
      id: `off_${i}`,
      slices: [{ segments: [segment()] }],
    }))
    mockFetchOnce(offerResponse(offers))

    const result = await searchDuffel(baseParams)

    expect(result).toHaveLength(20)
  })

  it('returns [] when fetch rejects rather than throwing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

    const result = await searchDuffel(baseParams)

    expect(result).toEqual([])
  })

  it('produces a well-formed Google Flights search URL containing the from/to/date', async () => {
    mockFetchOnce(offerResponse([{ id: 'off_1', slices: [{ segments: [segment()] }] }]))

    const result = await searchDuffel(baseParams)

    expect(result[0].book_url).toContain('LHR')
    expect(result[0].book_url).toContain('CDG')
    expect(result[0].book_url).toContain('2026-09-01')
    expect(result[0].book_url.startsWith('https://www.google.com/travel/flights/search')).toBe(true)
  })
})
