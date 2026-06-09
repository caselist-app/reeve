import type { HotelOption } from '@/lib/logistics/types'
import type { HotelAdapterParams } from '@/lib/logistics/adapters/ratehawk'

// Hotelbeds adapter: hotel search fallback.
// TODO: implement using Hotelbeds API credentials.
export async function searchHotelbeds(
  _params: HotelAdapterParams
): Promise<HotelOption[]> {
  return []
}
