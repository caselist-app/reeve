// Mock hotel adapter — used when no real provider credentials are configured.
// Returns deterministic results seeded from the venue lat/lng so the same
// location always produces the same hotels. Prices vary by tier and seed.
// Book links open Google Hotels pre-filled with location and dates so they
// are actually usable during demos and early testing.

import type { HotelOption } from '@/lib/logistics/types'
import type { HotelAdapterParams } from '@/lib/logistics/adapters/ratehawk'

// ── Hotel name pools by tier ──────────────────────────────────────────────────

const ARTIST_HOTELS = [
  { name: 'Marriott', suffix: 'City Centre' },
  { name: 'Hilton', suffix: '' },
  { name: 'DoubleTree by Hilton', suffix: '' },
  { name: 'Westin', suffix: '' },
  { name: 'InterContinental', suffix: '' },
  { name: 'Novotel', suffix: 'Centre' },
  { name: 'Crowne Plaza', suffix: '' },
  { name: 'Radisson Blu', suffix: '' },
  { name: 'Sofitel', suffix: '' },
  { name: 'Renaissance', suffix: 'Hotel' },
]

const CREW_HOTELS = [
  { name: 'Ibis', suffix: 'Centre' },
  { name: 'Ibis Styles', suffix: '' },
  { name: 'Holiday Inn Express', suffix: '' },
  { name: 'Premier Inn', suffix: 'City Centre' },
  { name: 'Hampton by Hilton', suffix: '' },
  { name: 'Courtyard by Marriott', suffix: '' },
  { name: 'Travelodge', suffix: 'Central' },
  { name: 'Mercure', suffix: '' },
  { name: 'Four Points by Sheraton', suffix: '' },
  { name: 'NH Hotel', suffix: '' },
]

// ── Deterministic seeded RNG ──────────────────────────────────────────────────
// A simple mulberry32 PRNG seeded from lat/lng. Same venue = same hotels.
// This matters for demos: the TM should not see different properties on refresh.

function makePrng(seed: number) {
  let s = seed >>> 0
  return function next(): number {
    s += 0x6d2b79f5
    let z = s
    z = Math.imul(z ^ (z >>> 15), z | 1)
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61)
    return ((z ^ (z >>> 14)) >>> 0) / 0x100000000
  }
}

function seedFrom(lat: number, lng: number): number {
  // Combine lat/lng into a single integer seed. Multiply by primes to spread bits.
  return Math.abs(Math.round(lat * 1000) * 31337 + Math.round(lng * 1000) * 7919)
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]
}

// ── Address construction ──────────────────────────────────────────────────────

const STREET_TYPES = ['Street', 'Avenue', 'Road', 'Boulevard', 'Place']
const STREET_NAMES = [
  'Grand', 'Central', 'Victoria', 'Royal', 'Plaza', 'Imperial', 'Palace',
  'Cathedral', 'Station', 'Commercial', 'Market', 'Union', 'Liberty',
]

function mockAddress(rng: () => number): string {
  const num = Math.floor(rng() * 200) + 1
  const name = pick(STREET_NAMES, rng)
  const type = pick(STREET_TYPES, rng)
  return `${num} ${name} ${type}`
}

// ── Price generation ──────────────────────────────────────────────────────────

function mockPrice(tier: 'artist' | 'crew', rng: () => number): number {
  if (tier === 'artist') {
    // 4-5 star range: £130 – £280/night
    return Math.round((130 + rng() * 150) / 5) * 5
  }
  // 3 star range: £70 – £140/night
  return Math.round((70 + rng() * 70) / 5) * 5
}

function mockStars(tier: 'artist' | 'crew', rng: () => number): number {
  if (tier === 'artist') return rng() > 0.3 ? 5 : 4
  return rng() > 0.4 ? 4 : 3
}

// ── Google Hotels book link ───────────────────────────────────────────────────

function googleHotelsUrl(
  hotelName: string,
  checkIn: string,
  checkOut: string
): string {
  const query = encodeURIComponent(hotelName)
  return `https://www.google.com/travel/hotels?q=${query}&checkin=${checkIn}&checkout=${checkOut}`
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function searchMockHotels(
  params: HotelAdapterParams
): Promise<HotelOption[]> {
  const rng = makePrng(seedFrom(params.lat, params.lng))
  const pool = params.tier === 'artist' ? ARTIST_HOTELS : CREW_HOTELS

  // Return 5 results per tier — same count as MAX_RESULTS_PER_TIER in hotels.ts.
  const count = 5
  const results: HotelOption[] = []

  // Shuffle a copy of the pool so we get different hotels each call within the
  // same tier without repeats. Fisher-Yates with our seeded RNG.
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  for (let i = 0; i < count; i++) {
    const template = shuffled[i % shuffled.length]
    const fullName = template.suffix
      ? `${template.name} ${template.suffix}`
      : template.name
    const stars = mockStars(params.tier, rng)
    const price = mockPrice(params.tier, rng)
    const hasParking = rng() > 0.45

    results.push({
      property: fullName,
      address: mockAddress(rng),
      tier: params.tier,
      parking_ok: hasParking,
      early_check_in_ok: rng() > 0.5,
      stars,
      book_url: googleHotelsUrl(fullName, params.check_in_date, params.check_out_date),
      raw: { provider: 'mock', seed: seedFrom(params.lat, params.lng) },
    })
  }

  return results
}
