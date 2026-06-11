// Standard transit buffer constants shared across the logistics layer and client components.
// Kept in a separate file so client components can import these without pulling in
// server-only modules (e.g. hub-resolver imports createAdminClient).
export const AIRPORT_TRANSIT_MIN = 45
export const RAIL_TRANSIT_MIN = 15
