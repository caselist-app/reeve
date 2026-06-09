import type { HotelOption } from '@/lib/logistics/types'

export type HotelSearchParams = {
  lat: number
  lng: number
  check_in: string    // YYYY-MM-DD
  check_out: string   // YYYY-MM-DD
  guests: number
  requires_parking: boolean
  requires_early_check_in: boolean
}

// RateHawk adapter: hotel search (V1 search and filter only, no booking).
// TODO: implement using RATEHAWK_API_KEY.
export async function searchRatehawk(
  params: HotelSearchParams
): Promise<HotelOption[]> {
  if (!process.env.RATEHAWK_API_KEY) return []
  return []
}
