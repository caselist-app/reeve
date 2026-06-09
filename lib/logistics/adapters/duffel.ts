import type { TravelOption } from '@/lib/logistics/types'

export type DuffelSearchParams = {
  from_iata: string
  to_iata: string
  date: string         // YYYY-MM-DD
  passengers: number
}

// Duffel adapter: flights search (V1 search only, booking is off-platform).
// Returns normalised TravelOption[] - never a raw Duffel offer.
// TODO: implement Duffel Offers API call using DUFFEL_API_TOKEN.
export async function searchDuffel(
  params: DuffelSearchParams
): Promise<TravelOption[]> {
  if (!process.env.DUFFEL_API_TOKEN) return []
  // Stub - live implementation replaces this block.
  return []
}
