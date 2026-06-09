// The normalisation contract for the logistics layer.
// Everything above Layer 4 (UI, ranking, planner) only ever sees these shapes.
// No vendor payload (Duffel offer, RateHawk room) ever surfaces above this file.
// Adapters must convert to these shapes before returning.

export type TravelOption = {
  mode: 'flight' | 'rail' | 'ground'
  depart_at: string       // ISO 8601
  arrive_at: string       // ISO 8601 - arrival at destination hub, not the venue
  carrier: string
  leg_ref: string         // flight number or train number
  transit_min: number     // hub egress buffer (e.g. 45 min at an airport)
  ground_min: number      // hub to venue/site drive time in minutes
  door_to_site_at: string // arrive_at + transit_min + ground_min - the only time that matters
  feasible: boolean       // door_to_site_at <= required_site_arrival
  book_url: string        // deep link to the carrier booking page
  raw: unknown            // original provider payload, never read outside the adapter
}

export type HotelOption = {
  property: string
  address: string
  tier: 'artist' | 'crew'
  parking_ok: boolean
  early_check_in_ok: boolean
  stars: number | null
  book_url: string
  raw: unknown
}

export type HubResolution = {
  iata: string | null     // nearest commercial airport IATA code
  rail: string | null     // nearest major rail station code
  ground_minutes: number  // drive time from hub to venue/site
}

export type PlanTravelInput = {
  person_id: string
  show_id: string
}

export type PlanHotelsInput = {
  show_id: string
  party: {
    crew_count: number
    artist_count: number
    parking_required: boolean
  }
  arrive_at: string | null
  depart_at: string | null
  product_type: 'overnight' | 'day_rooms'
}
