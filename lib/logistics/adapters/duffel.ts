import { AIRPORT_TRANSIT_MIN } from '@/lib/logistics/constants'
import type { TravelOption } from '@/lib/logistics/types'

export type DuffelSearchParams = {
  from_iata: string
  to_iata: string
  date: string          // YYYY-MM-DD
  passengers: number
  ground_min: number    // venue hub to venue drive time, from show row
}

const BASE = 'https://api.duffel.com'

// Cap offers returned to the TM. 128 options for LHR-CDG is too many to render.
const MAX_OFFERS = 20

// Duffel response types — only the fields we read.
interface DuffelSegment {
  departing_at: string
  arriving_at: string
  origin: { iata_code: string }
  destination: { iata_code: string }
  marketing_carrier: { name: string; iata_code: string; logo_symbol_url: string | null }
  marketing_carrier_flight_number: string
}

interface DuffelSlice {
  segments: DuffelSegment[]
}

interface DuffelOffer {
  id: string
  slices: DuffelSlice[]
}

interface DuffelOfferRequestResponse {
  data: {
    offers: DuffelOffer[]
  }
  errors?: { title: string; message: string }[]
}

// Constructs a Google Flights search URL as the off-platform book link.
// The TM will book on the carrier site — this gets them to a pre-filled search.
function bookUrl(from: string, to: string, date: string): string {
  return `https://www.google.com/travel/flights/search?hl=en&q=Flights+from+${from}+to+${to}+on+${date}`
}

// Duffel returns local departure/arrival times without timezone offset.
// Append Z to treat as UTC for consistent ISO 8601 handling. In production
// the planner shows times in the tour timezone so this is adjusted at display time.
function toIso(localDatetime: string): string {
  return localDatetime.endsWith('Z') || localDatetime.includes('+')
    ? localDatetime
    : `${localDatetime}Z`
}

// Duffel adapter: flights search (V1 — search only, booking is off-platform).
// Returns normalised TravelOption[], never a raw Duffel offer.
export async function searchDuffel(
  params: DuffelSearchParams
): Promise<TravelOption[]> {
  const token = process.env.DUFFEL_API_TOKEN
  if (!token) return []

  const body = {
    data: {
      slices: [
        {
          origin: params.from_iata,
          destination: params.to_iata,
          departure_date: params.date,
        },
      ],
      passengers: Array.from({ length: params.passengers }, () => ({ type: 'adult' })),
      cabin_class: 'economy',
    },
  }

  let json: DuffelOfferRequestResponse
  try {
    const res = await fetch(`${BASE}/air/offer_requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    })
    json = (await res.json()) as DuffelOfferRequestResponse
  } catch {
    return []
  }

  if (!json.data?.offers) return []

  const offers = json.data.offers.slice(0, MAX_OFFERS)

  const options: TravelOption[] = []

  for (const offer of offers) {
    // Only handle one-way single-slice offers for V1.
    const slice = offer.slices[0]
    if (!slice?.segments?.length) continue

    const firstSeg = slice.segments[0]
    const lastSeg = slice.segments[slice.segments.length - 1]

    const carrier = firstSeg.marketing_carrier.name
    const flightNumber = `${firstSeg.marketing_carrier.iata_code}${firstSeg.marketing_carrier_flight_number}`
    const departAt = toIso(firstSeg.departing_at)
    const arriveAt = toIso(lastSeg.arriving_at)

    options.push({
      mode: 'flight',
      depart_at: departAt,
      arrive_at: arriveAt,
      carrier,
      // Prefer Duffel's logo URL; fall back to Google Flights' airline logo CDN
      // which covers ~500 carriers and is keyed by IATA code.
      carrier_logo_url:
        firstSeg.marketing_carrier.logo_symbol_url ??
        `https://www.gstatic.com/flights/airline_logos/70px/${firstSeg.marketing_carrier.iata_code}.png`,
      leg_ref: flightNumber,
      transit_min: AIRPORT_TRANSIT_MIN,
      ground_min: params.ground_min,
      // door_to_site_at and feasible are computed by plan.ts after collection.
      door_to_site_at: arriveAt,
      feasible: true,
      book_url: bookUrl(params.from_iata, params.to_iata, params.date),
      ground_transit: null, // enriched by plan.ts after collection
      raw: { provider: 'duffel', offer_id: offer.id },
    })
  }

  return options
}
