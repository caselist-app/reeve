import type { TravelOption } from '@/lib/logistics/types'
import type { RailSearchParams } from '@/lib/logistics/adapters/trainline'

// SNCF Connect adapter: French domestic and cross-border rail.
// TODO: implement using SNCF_API_TOKEN.
export async function searchSncf(
  _params: RailSearchParams
): Promise<TravelOption[]> {
  if (!process.env.SNCF_API_TOKEN) return []
  return []
}
