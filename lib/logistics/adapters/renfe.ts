import type { TravelOption } from '@/lib/logistics/types'
import type { RailSearchParams } from '@/lib/logistics/adapters/trainline'

// RENFE adapter: Spanish rail.
// TODO: implement using RENFE_API_TOKEN.
export async function searchRenfe(
  params: RailSearchParams
): Promise<TravelOption[]> {
  if (!process.env.RENFE_API_TOKEN) return []
  return []
}
