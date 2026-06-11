// The normalisation contract for the logistics layer.
// Everything above Layer 4 (UI, ranking, planner) only ever sees these shapes.
// No vendor payload (Duffel offer, RateHawk room) ever surfaces above this file.
// Adapters must convert to these shapes before returning.

// One step in a multi-modal ground journey (walk, wait at stop, or board a vehicle).
export type TransitStep = {
  mode: 'walking' | 'waiting' | 'transit'
  from_name: string
  to_name: string
  depart_at: string | null   // ISO — null for walking/waiting (no fixed schedule)
  arrive_at: string | null   // ISO — null for walking/waiting
  duration_min: number
  line_name: string | null   // e.g. "Alvia", "Jubilee line"
  vehicle_type: string | null // "HIGH_SPEED_TRAIN" | "RAIL" | "BUS" | "SUBWAY" | "TRAM"
  num_stops: number | null
}

// The full ground leg from hub exit to venue, with real transit steps.
export type GroundTransit = {
  depart_at: string       // ISO — when they leave the hub
  arrive_at: string       // ISO — when they arrive at the venue
  duration_min: number    // total including walks and waits
  steps: TransitStep[]
  maps_url: string        // Google Maps directions link for this leg
}

export type TravelOption = {
  mode: 'flight' | 'rail' | 'ground'
  depart_at: string       // ISO 8601
  arrive_at: string       // ISO 8601 - arrival at destination hub, not the venue
  carrier: string
  carrier_logo_url: string | null  // airline logo from provider, null for rail / ground
  leg_ref: string         // flight number or train number
  transit_min: number     // hub egress buffer (e.g. 45 min at an airport)
  ground_min: number      // hub to venue drive time in minutes (car estimate or actual transit)
  door_to_site_at: string // the only time that matters: when they reach the venue
  feasible: boolean       // door_to_site_at <= required_site_arrival
  book_url: string        // deep link to the carrier booking page
  // First-mile transit: origin city → departure hub (freeform planner only).
  // Null in the show planner — the person is assumed to start from their home hub.
  first_mile_transit?: GroundTransit | null
  ground_transit: GroundTransit | null // real transit steps, null = car/taxi estimate
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
  // When set, skips getFromHub auto-resolution and uses this IATA code directly.
  // The planner UI sets this when the TM overrides the departure point.
  from_override?: string | null
  // When set, searches this date instead of the show date.
  // Used to search the day before when same-day options are all infeasible.
  date_override?: string | null
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
