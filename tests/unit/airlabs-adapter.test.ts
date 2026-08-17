import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  lookupFlightByNumber,
  searchRouteTimetable,
  AirLabsRateLimitError,
} from '@/lib/logistics/adapters/airlabs'

describe('airlabs adapter', () => {
  const originalFetch = global.fetch
  const originalKey = process.env.AIRLABS_API_KEY

  beforeEach(() => {
    process.env.AIRLABS_API_KEY = 'test-key'
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.AIRLABS_API_KEY
    else process.env.AIRLABS_API_KEY = originalKey
    vi.restoreAllMocks()
  })

  function mockFetchOnce(body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch
  }

  function baseFlightRaw(overrides: Record<string, unknown> = {}) {
    return {
      airline_iata: 'BA',
      airline_icao: 'BAW',
      airline_name: 'British Airways',
      flight_iata: 'BA304',
      flight_icao: 'BAW304',
      flight_number: '304',
      dep_iata: 'LHR',
      dep_icao: 'EGLL',
      dep_name: 'Heathrow',
      dep_city: 'London',
      dep_terminal: '5',
      dep_gate: 'A10',
      dep_time: '2026-08-17 14:30',
      dep_time_utc: '2026-08-17 14:30',
      dep_estimated_utc: null,
      dep_actual_utc: null,
      arr_iata: 'CDG',
      arr_icao: 'LFPG',
      arr_name: 'Charles de Gaulle',
      arr_city: 'Paris',
      arr_terminal: '2E',
      arr_gate: 'K12',
      arr_time: '2026-08-17 16:45',
      arr_time_utc: '2026-08-17 16:45',
      arr_estimated_utc: null,
      arr_actual_utc: null,
      status: 'scheduled',
      dep_delayed: 0,
      arr_delayed: 0,
      ...overrides,
    }
  }

  // ── lookupFlightByNumber / normalizeFlight ────────────────────────────

  describe('lookupFlightByNumber', () => {
    it('normalises a successful envelope into a NormalizedFlightLookup', async () => {
      mockFetchOnce({ request: {}, response: baseFlightRaw() })

      const result = await lookupFlightByNumber('BA304')

      expect(result).toEqual({
        airline_name: 'British Airways',
        airline_iata: 'BA',
        flight_iata: 'BA304',
        origin_iata: 'LHR',
        destination_iata: 'CDG',
        origin_name: 'Heathrow',
        destination_name: 'Charles de Gaulle',
        dep_terminal: '5',
        dep_gate: 'A10',
        arr_terminal: '2E',
        arr_gate: 'K12',
        dep_time_local: '2026-08-17 14:30',
        arr_time_local: '2026-08-17 16:45',
        dep_time_utc: '2026-08-17T14:30:00Z',
        arr_time_utc: '2026-08-17T16:45:00Z',
        flight_status: 'scheduled',
        actual_depart_at: null,
        actual_arrive_at: null,
        raw: baseFlightRaw(),
      })
    })

    it('falls back flight_iata to empty string when null', async () => {
      mockFetchOnce({ request: {}, response: baseFlightRaw({ flight_iata: null }) })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_iata).toBe('')
    })

    it('converts AirLabs "YYYY-MM-DD HH:MM" to ISO 8601 UTC', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({ dep_time_utc: '2026-08-17 14:30' }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.dep_time_utc).toBe('2026-08-17T14:30:00Z')
    })

    it('keeps a null UTC time field null rather than producing a malformed string', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({ dep_time_utc: null }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.dep_time_utc).toBeNull()
    })

    it.each([
      ['cancelled', 'cancelled'],
      ['landed', 'landed'],
      ['active', 'departed'],
      ['en-route', 'departed'],
    ])('maps raw status %s to flight_status %s', async (raw, expected) => {
      mockFetchOnce({ request: {}, response: baseFlightRaw({ status: raw }) })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe(expected)
    })

    it('normalises scheduled with delays under the threshold to "scheduled"', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({ status: 'scheduled', dep_delayed: 5, arr_delayed: 14 }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('scheduled')
    })

    it('normalises scheduled with a delay at or above 15 minutes to "delayed"', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({ status: 'scheduled', dep_delayed: 15, arr_delayed: 0 }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('delayed')
    })

    it('normalises scheduled with an arr_delayed at the 15-minute boundary to "delayed"', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({ status: 'scheduled', dep_delayed: 0, arr_delayed: 15 }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('delayed')
    })

    it('only populates actual_depart_at once status is departed', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({
          status: 'active',
          dep_actual_utc: '2026-08-17 14:35',
          arr_actual_utc: null,
        }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('departed')
      expect(result!.actual_depart_at).toBe('2026-08-17T14:35:00Z')
      expect(result!.actual_arrive_at).toBeNull()
    })

    it('only populates actual_arrive_at once status is landed', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({
          status: 'landed',
          dep_actual_utc: '2026-08-17 14:35',
          arr_actual_utc: '2026-08-17 16:50',
        }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('landed')
      expect(result!.actual_depart_at).toBe('2026-08-17T14:35:00Z')
      expect(result!.actual_arrive_at).toBe('2026-08-17T16:50:00Z')
    })

    it('leaves actual_depart_at/actual_arrive_at null for a scheduled flight even when stale actual fields are present', async () => {
      mockFetchOnce({
        request: {},
        response: baseFlightRaw({
          status: 'scheduled',
          dep_actual_utc: '2026-08-16 14:35', // stale, from a prior instance
          arr_actual_utc: '2026-08-16 16:50',
        }),
      })

      const result = await lookupFlightByNumber('BA304')

      expect(result!.flight_status).toBe('scheduled')
      expect(result!.actual_depart_at).toBeNull()
      expect(result!.actual_arrive_at).toBeNull()
    })

    it('returns null (not throwing) on a not_found error code', async () => {
      mockFetchOnce({ error: { message: 'not found', code: 'not_found' } })

      const result = await lookupFlightByNumber('ZZ999')

      expect(result).toBeNull()
    })

    it.each(['minute_limit_exceeded', 'hour_limit_exceeded', 'month_limit_exceeded'])(
      'throws AirLabsRateLimitError on rate-limit code %s',
      async (code) => {
        mockFetchOnce({ error: { message: 'rate limited', code } })

        await expect(lookupFlightByNumber('BA304')).rejects.toBeInstanceOf(AirLabsRateLimitError)
      }
    )

    it('throws a plain Error on any other error code', async () => {
      mockFetchOnce({ error: { message: 'bad request', code: 'invalid_access_key' } })

      await expect(lookupFlightByNumber('BA304')).rejects.toThrow('AirLabs API error')
    })

    it('throws before calling fetch when AIRLABS_API_KEY is missing', async () => {
      delete process.env.AIRLABS_API_KEY
      global.fetch = vi.fn() as unknown as typeof fetch

      await expect(lookupFlightByNumber('BA304')).rejects.toThrow('AIRLABS_API_KEY not configured')
      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  // ── searchRouteTimetable ───────────────────────────────────────────────

  describe('searchRouteTimetable', () => {
    it('maps snake_case fields to the camelCase NormalizedRouteTimetableEntry shape', async () => {
      mockFetchOnce({
        request: {},
        response: [
          {
            airline_iata: 'BA',
            flight_iata: 'BA304',
            flight_number: '304',
            dep_iata: 'LHR',
            dep_time: '14:30',
            arr_iata: 'CDG',
            arr_time: '16:45',
            duration: 135,
            days: ['Mon', 'TUE', 'wed'],
          },
        ],
      })

      const result = await searchRouteTimetable({ airlineIata: 'BA', depIata: 'LHR', arrIata: 'CDG' })

      expect(result).toEqual([
        {
          flightIata: 'BA304',
          flightNumber: '304',
          depIata: 'LHR',
          depTimeLocal: '14:30',
          arrIata: 'CDG',
          arrTimeLocal: '16:45',
          durationMinutes: 135,
          days: ['mon', 'tue', 'wed'],
        },
      ])
    })

    it('filters out entries with no flight_iata', async () => {
      mockFetchOnce({
        request: {},
        response: [
          {
            airline_iata: 'BA',
            flight_iata: null,
            flight_number: null,
            dep_iata: 'LHR',
            dep_time: '14:30',
            arr_iata: 'CDG',
            arr_time: '16:45',
            duration: 135,
            days: [],
          },
          {
            airline_iata: 'BA',
            flight_iata: 'BA305',
            flight_number: '305',
            dep_iata: 'LHR',
            dep_time: '18:00',
            arr_iata: 'CDG',
            arr_time: '20:15',
            duration: 135,
            days: ['fri'],
          },
        ],
      })

      const result = await searchRouteTimetable({ airlineIata: 'BA', depIata: 'LHR', arrIata: 'CDG' })

      expect(result).toHaveLength(1)
      expect(result[0].flightIata).toBe('BA305')
    })

    it('returns [] on a not_found error envelope', async () => {
      mockFetchOnce({ error: { message: 'not found', code: 'not_found' } })

      const result = await searchRouteTimetable({ airlineIata: 'BA', depIata: 'LHR', arrIata: 'CDG' })

      expect(result).toEqual([])
    })
  })
})
