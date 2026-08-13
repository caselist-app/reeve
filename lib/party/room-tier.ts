// room_assignments.room_tier only ever splits artist from crew (the check
// constraint has no third value), so management and support fold into crew.
// Shared by lib/actions/hotels.ts (createHotelStay) and
// lib/actions/extractions.ts (confirmExtraction), which write room_assignments
// from the same party-selection shape. Not defined in either 'use server'
// file: every export from a 'use server' file must itself be an async server
// action, and this is a plain sync helper.
export function roomTierFor(personType: string): 'artist' | 'crew' {
  return personType === 'artist' ? 'artist' : 'crew'
}
