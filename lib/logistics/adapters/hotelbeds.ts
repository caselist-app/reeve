import type { HotelOption } from '@/lib/logistics/types'
import type { HotelSearchParams } from '@/lib/logistics/adapters/ratehawk'

// Hotelbeds adapter: hotel search fallback.
// TODO: implement using Hotelbeds API credentials.
export async function searchHotelbeds(
  params: HotelSearchParams
): Promise<HotelOption[]> {
  return []
}
