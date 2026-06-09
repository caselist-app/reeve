import type { TravelOption } from '@/lib/logistics/types'

export type RailSearchParams = {
  from_station: string
  to_station: string
  depart_after: string   // ISO 8601
  passengers: number
}

// Trainline Partner / Omio B2B adapter: EU rail.
// TODO: implement using TRAINLINE_PARTNER_TOKEN.
export async function searchTrainline(
  params: RailSearchParams
): Promise<TravelOption[]> {
  if (!process.env.TRAINLINE_PARTNER_TOKEN) return []
  return []
}
