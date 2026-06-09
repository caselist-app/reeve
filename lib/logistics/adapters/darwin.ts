import type { TravelOption } from '@/lib/logistics/types'
import type { RailSearchParams } from '@/lib/logistics/adapters/trainline'

// National Rail Darwin adapter: UK rail (free tier API).
// Darwin provides live departure boards and journey planning for Great Britain.
// TODO: implement using National Rail Darwin API (no token required for free tier).
export async function searchDarwin(
  params: RailSearchParams
): Promise<TravelOption[]> {
  return []
}
