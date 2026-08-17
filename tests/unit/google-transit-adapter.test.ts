import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  searchGoogleTransitCityToCity,
  searchGoogleTransit,
  type GoogleTransitCityParams,
  type GoogleTransitParams,
} from '@/lib/logistics/adapters/google-transit'

describe('google-transit adapter', () => {
  const originalFetch = global.fetch
  const originalKey = process.env.GOOGLE_MAPS_API_KEY

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
  })

  afterEach(() => {
    global.fetch = originalFetch
    if (originalKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY
    else process.env.GOOGLE_MAPS_API_KEY = originalKey
    vi.restoreAllMocks()
  })

  function mockFetchOnce(body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(body),
    }) as unknown as typeof fetch
  }

  // ── searchGoogleTransitCityToCity ─────────────────────────────────────

  describe('searchGoogleTransitCityToCity', () => {
    const cityParams: GoogleTransitCityParams = {
      from_lat: 51.5,
      from_lng: -0.1,
      from_name: 'London',
      to_lat: 48.85,
      to_lng: 2.35,
      to_name: 'Paris',
      date: '2026-09-01',
    }

    function transitStep(overrides: Partial<{
      lineName: string
      shortName: string
      vehicleType: string
      departValue: number
      arriveValue: number
    }> = {}) {
      return {
        travel_mode: 'TRANSIT',
        duration: { value: 3600 },
        html_instructions: 'Ride the train',
        transit_details: {
          departure_stop: { name: 'St Pancras' },
          arrival_stop: { name: 'Gare du Nord' },
          departure_time: { value: overrides.departValue ?? 1893000000, text: '' },
          arrival_time: { value: overrides.arriveValue ?? 1893003600, text: '' },
          num_stops: 0,
          line: {
            name: overrides.lineName ?? 'Eurostar',
            short_name: overrides.shortName,
            vehicle: { type: overrides.vehicleType ?? 'HIGH_SPEED_TRAIN' },
          },
        },
      }
    }

    function walkingStep() {
      return {
        travel_mode: 'WALKING',
        duration: { value: 300 },
        html_instructions: 'Walk to platform',
      }
    }

    it('normalises a rail-dominant route into a TravelOption with mode rail', async () => {
      mockFetchOnce({
        status: 'OK',
        routes: [
          {
            legs: [
              {
                departure_time: { value: 1893000000, text: '' },
                arrival_time: { value: 1893003600, text: '' },
                duration: { value: 3600 },
                steps: [walkingStep(), transitStep(), walkingStep()],
              },
            ],
          },
        ],
      })

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result).toHaveLength(1)
      expect(result[0].mode).toBe('rail')
      expect(result[0].carrier).toBe('Eurostar')
      expect(result[0].depart_at).toBe(new Date(1893000000 * 1000).toISOString())
      expect(result[0].arrive_at).toBe(new Date(1893003600 * 1000).toISOString())
      expect(result[0].feasible).toBe(true)
      expect(result[0].door_to_site_at).toBe(result[0].arrive_at)
    })

    it('falls back to ground mode and carrier "Transit" when the route has no transit steps', async () => {
      mockFetchOnce({
        status: 'OK',
        routes: [
          {
            legs: [
              {
                departure_time: { value: 1893000000, text: '' },
                arrival_time: { value: 1893003600, text: '' },
                duration: { value: 3600 },
                steps: [walkingStep()],
              },
            ],
          },
        ],
      })

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result[0].mode).toBe('ground')
      expect(result[0].carrier).toBe('Transit')
      expect(result[0].leg_ref).toBe('')
    })

    it('returns [] and never calls fetch when GOOGLE_MAPS_API_KEY is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      global.fetch = vi.fn() as unknown as typeof fetch

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result).toEqual([])
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('returns [] when status is not OK', async () => {
      mockFetchOnce({ status: 'ZERO_RESULTS', routes: [] })

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result).toEqual([])
    })

    it('returns [] when status is REQUEST_DENIED', async () => {
      mockFetchOnce({ status: 'REQUEST_DENIED', routes: [] })

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result).toEqual([])
    })

    it('returns [] when fetch rejects rather than throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      const result = await searchGoogleTransitCityToCity(cityParams)

      expect(result).toEqual([])
    })
  })

  // ── searchGoogleTransit (ground leg) ──────────────────────────────────

  describe('searchGoogleTransit', () => {
    const groundParams: GoogleTransitParams = {
      origin_lat: 51.47,
      origin_lng: -0.454,
      origin_name: 'Heathrow Airport',
      dest_address: '123 Venue St, London',
      dest_lat: 51.5,
      dest_lng: -0.12,
      depart_after: '2026-09-01T10:00:00Z',
    }

    const legDepart = Math.floor(new Date('2026-09-01T10:00:00Z').getTime() / 1000)

    function walking(seconds: number, instructions = 'Walk to Terminal') {
      return {
        travel_mode: 'WALKING' as const,
        duration: { value: seconds },
        html_instructions: instructions,
      }
    }

    function transit(departOffsetSec: number, durationSec: number) {
      const departValue = legDepart + departOffsetSec
      const arriveValue = departValue + durationSec
      return {
        travel_mode: 'TRANSIT' as const,
        duration: { value: durationSec },
        html_instructions: 'Ride the Piccadilly line',
        transit_details: {
          departure_stop: { name: 'Heathrow T5' },
          arrival_stop: { name: 'Piccadilly Circus' },
          departure_time: { value: departValue, text: '' },
          arrival_time: { value: arriveValue, text: '' },
          num_stops: 12,
          line: { name: 'Piccadilly line', short_name: 'Piccadilly', vehicle: { type: 'SUBWAY' } },
        },
      }
    }

    function mockDirections(steps: unknown[], legDurationSec = 3600) {
      mockFetchOnce({
        status: 'OK',
        routes: [
          {
            legs: [
              {
                departure_time: { value: legDepart, text: '' },
                arrival_time: { value: legDepart + legDurationSec, text: '' },
                duration: { value: legDurationSec },
                steps,
              },
            ],
          },
        ],
      })
    }

    it('folds the gap between the walk cursor and transit departure into the merged walking step', async () => {
      // The synthetic cursor-gap entry insertWaits() builds is itself tagged
      // travel_mode: 'WALKING' (see source), so it lands in the same branch
      // as a real walking step rather than the separate 'waiting' branch:
      // in practice no TransitStep with mode 'waiting' is ever produced from
      // an ordinary WALKING/TRANSIT step sequence. Walk for 300s (5 min),
      // then a 600s (10 min) gap before the transit departs: both fold into
      // one merged 'walking' step of 15 min, named for the upcoming stop.
      mockDirections([walking(300), transit(900, 1200)])

      const result = await searchGoogleTransit(groundParams)

      expect(result).not.toBeNull()
      const modes = result!.steps.map((s) => s.mode)
      expect(modes).toEqual(['walking', 'transit'])
      expect(result!.steps.find((s) => s.mode === 'waiting')).toBeUndefined()
      const walkStep = result!.steps.find((s) => s.mode === 'walking')!
      expect(walkStep.duration_min).toBe(15) // 5 min walk + 10 min gap, merged
      expect(walkStep.to_name).toBe('Heathrow T5') // named for the upcoming transit stop
    })

    it('produces a lone merged walking step for a pre-departure gap even with no real walking step in the input', async () => {
      mockDirections([transit(600, 1200)])

      const result = await searchGoogleTransit(groundParams)

      expect(result!.steps.map((s) => s.mode)).toEqual(['walking', 'transit'])
      expect(result!.steps[0].duration_min).toBe(10) // 600s gap / 60
    })

    it('populates the transit step fields from transit_details', async () => {
      mockDirections([transit(0, 1200)])

      const result = await searchGoogleTransit(groundParams)

      const transitStep = result!.steps.find((s) => s.mode === 'transit')!
      expect(transitStep.from_name).toBe('Heathrow T5')
      expect(transitStep.to_name).toBe('Piccadilly Circus')
      expect(transitStep.depart_at).toBe(new Date(legDepart * 1000).toISOString())
      expect(transitStep.arrive_at).toBe(new Date((legDepart + 1200) * 1000).toISOString())
      expect(transitStep.line_name).toBe('Piccadilly line')
      expect(transitStep.vehicle_type).toBe('SUBWAY')
      expect(transitStep.num_stops).toBe(12)
    })

    it('merges consecutive walking steps that share the same to_name', async () => {
      // Two walking sub-legs before the transit step both resolve to_name to
      // the transit step's departure stop ("Heathrow T5"), so they merge into one.
      mockDirections([walking(120, 'Exit terminal'), walking(180, 'Walk to platform'), transit(300, 600)])

      const result = await searchGoogleTransit(groundParams)

      const walkingSteps = result!.steps.filter((s) => s.mode === 'walking')
      expect(walkingSteps).toHaveLength(1)
      expect(walkingSteps[0].to_name).toBe('Heathrow T5')
      expect(walkingSteps[0].duration_min).toBe(5) // (120+180)/60
    })

    it('filters zero-duration steps out of the final steps array', async () => {
      mockDirections([walking(0, 'Instant step'), transit(0, 1200)])

      const result = await searchGoogleTransit(groundParams)

      expect(result!.steps.every((s) => s.duration_min > 0)).toBe(true)
      // The zero-duration walk should not appear as a distinct entry.
      expect(result!.steps.filter((s) => s.mode === 'walking')).toHaveLength(0)
    })

    it('returns null and never calls fetch when GOOGLE_MAPS_API_KEY is missing', async () => {
      delete process.env.GOOGLE_MAPS_API_KEY
      global.fetch = vi.fn() as unknown as typeof fetch

      const result = await searchGoogleTransit(groundParams)

      expect(result).toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('returns null and never calls fetch when there is no destination', async () => {
      global.fetch = vi.fn() as unknown as typeof fetch

      const result = await searchGoogleTransit({
        ...groundParams,
        dest_address: '',
        dest_lat: null,
        dest_lng: null,
      })

      expect(result).toBeNull()
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('returns null when status is not OK', async () => {
      mockFetchOnce({ status: 'ZERO_RESULTS', routes: [] })

      const result = await searchGoogleTransit(groundParams)

      expect(result).toBeNull()
    })

    it('returns null when routes[0].legs[0] is missing', async () => {
      mockFetchOnce({ status: 'OK', routes: [{ legs: [] }] })

      const result = await searchGoogleTransit(groundParams)

      expect(result).toBeNull()
    })

    it('returns null when fetch rejects rather than throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch

      const result = await searchGoogleTransit(groundParams)

      expect(result).toBeNull()
    })

    it('produces a well-formed Google Maps directions link containing the encoded origin/destination', async () => {
      mockDirections([transit(0, 1200)])

      const result = await searchGoogleTransit(groundParams)

      expect(result!.maps_url.startsWith('https://www.google.com/maps/dir/?api=1')).toBe(true)
      expect(result!.maps_url).toContain(encodeURIComponent('Heathrow Airport'))
      expect(result!.maps_url).toContain('travelmode=transit')
    })
  })
})
