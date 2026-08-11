import type { DayType } from '@/lib/schedule/day-link'

// What the venue section of day info should be for a given day. Extracted as a
// pure function so the copy decision is testable and lives in one place.
//   venue       the day has a show row: render the clickable VenueBlock
//   needs-venue a show day with no show row yet: "No venue yet." plus a button
//               that opens edit-day to add the venue (hands off to ShowForm)
//   absent      no venue section at all
export type VenueSectionState =
  | { kind: 'venue' }
  | { kind: 'needs-venue' }
  | { kind: 'absent' }

export function venueSectionState(dayType: DayType, hasShow: boolean): VenueSectionState {
  // Only a show day has a venue. On a travel day the venue section is absent as
  // a matter of fact, not as a matter of the system's opinion: a travel day has
  // no venue to have, so there is nothing to say. Do not restore a sentence
  // ("No show on this date.") that reads as if a venue were missing.
  if (dayType !== 'show') return { kind: 'absent' }
  return hasShow ? { kind: 'venue' } : { kind: 'needs-venue' }
}
