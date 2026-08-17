import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { searchRatehawk } from '@/lib/logistics/adapters/ratehawk'
import { searchHotelbeds } from '@/lib/logistics/adapters/hotelbeds'
import { searchTrainline } from '@/lib/logistics/adapters/trainline'
import { searchSncf } from '@/lib/logistics/adapters/sncf'
import { searchRenfe } from '@/lib/logistics/adapters/renfe'
import { searchDarwin } from '@/lib/logistics/adapters/darwin'
import { searchExpedia } from '@/lib/logistics/adapters/expedia'
import type { HotelAdapterParams } from '@/lib/logistics/adapters/ratehawk'
import type { RailSearchParams } from '@/lib/logistics/adapters/trainline'

// These seven adapters are unimplemented TODO stubs. There is no real
// normalisation logic to test yet, so this is a thin regression pin: when
// one of them is implemented, a diff to its return type or a forgotten
// credential guard shows up here rather than silently.

const hotelParams: HotelAdapterParams = {
  lat: 51.5,
  lng: -0.1,
  radius_km: 10,
  check_in_date: '2026-09-01',
  check_out_date: '2026-09-02',
  rooms: 1,
  arrive_at: null,
  depart_at: null,
  parking_required: false,
  tier: 'crew',
}

const railParams: RailSearchParams = {
  from_station: 'PAR',
  to_station: 'LYS',
  depart_after: '2026-09-01T06:00:00Z',
  passengers: 1,
}

describe('unimplemented hotel adapter stubs', () => {
  it('searchHotelbeds resolves to an empty array', async () => {
    await expect(searchHotelbeds(hotelParams)).resolves.toEqual([])
  })

  it('searchExpedia resolves to an empty array', async () => {
    await expect(searchExpedia(hotelParams)).resolves.toEqual([])
  })
})

describe('unimplemented rail adapter stubs', () => {
  it('searchDarwin resolves to an empty array', async () => {
    await expect(searchDarwin(railParams)).resolves.toEqual([])
  })
})

describe('unimplemented adapter stubs gated on a missing credential', () => {
  const savedEnv: Record<string, string | undefined> = {}
  const keys = [
    'RATEHAWK_API_KEY',
    'TRAINLINE_PARTNER_TOKEN',
    'SNCF_API_TOKEN',
    'RENFE_API_TOKEN',
  ]

  beforeEach(() => {
    for (const key of keys) {
      savedEnv[key] = process.env[key]
      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of keys) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  it('searchRatehawk resolves to an empty array with no RATEHAWK_API_KEY', async () => {
    await expect(searchRatehawk(hotelParams)).resolves.toEqual([])
  })

  it('searchTrainline resolves to an empty array with no TRAINLINE_PARTNER_TOKEN', async () => {
    await expect(searchTrainline(railParams)).resolves.toEqual([])
  })

  it('searchSncf resolves to an empty array with no SNCF_API_TOKEN', async () => {
    await expect(searchSncf(railParams)).resolves.toEqual([])
  })

  it('searchRenfe resolves to an empty array with no RENFE_API_TOKEN', async () => {
    await expect(searchRenfe(railParams)).resolves.toEqual([])
  })
})
