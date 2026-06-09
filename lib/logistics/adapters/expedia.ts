import type { HotelOption } from '@/lib/logistics/types'
import type { HotelSearchParams } from '@/lib/logistics/adapters/ratehawk'

// Expedia Rapid adapter: hotel search fallback.
// TODO: implement using Expedia Rapid API credentials.
export async function searchExpedia(
  params: HotelSearchParams
): Promise<HotelOption[]> {
  return []
}
