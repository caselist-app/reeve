import type { HotelOption } from '@/lib/logistics/types'

export type HotelAdapterParams = {
  lat: number
  lng: number
  radius_km: number
  check_in_date: string         // YYYY-MM-DD
  check_out_date: string        // YYYY-MM-DD
  rooms: number
  arrive_at: string | null      // ISO — used to determine early_check_in_ok
  depart_at: string | null
  parking_required: boolean
  tier: 'artist' | 'crew'
}

// RateHawk adapter: hotel search (V1 search and filter only, no booking).
// TODO: implement using RATEHAWK_API_KEY / RATEHAWK_API_SECRET.
// POST https://api.worldota.net/api/b2b/v3/search/serp/hotels/
// Determine early_check_in_ok from arrive_at: if before 06:00 local, default false;
// if before 14:00, check amenities flags; otherwise true.
export async function searchRatehawk(
  _params: HotelAdapterParams
): Promise<HotelOption[]> {
  if (!process.env.RATEHAWK_API_KEY) return []
  return []
}
