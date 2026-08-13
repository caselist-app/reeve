// REE-170. Zero people attached to a transport_segment or hotel_stay is worth
// flagging in the day view, for every mode a segment can carry, including
// truck: a truck with nobody on it is exactly as unactioned as an empty
// flight. This never blocks a save; it is purely what the day view shows, so
// it is deliberately kept out of lib/validators (no .min(1) belongs on a
// people field there, see extraction.ts's partySelectionSchema).
//
// Takes every id that should be considered, not just the ones with an
// assignment row, because an id with zero assignment rows never appears in
// `assignedIds` at all and would otherwise be invisible to a plain filter.
export function emptyPartyIds(allIds: string[], assignedIds: Iterable<string>): Set<string> {
  const withPeople = new Set(assignedIds)
  return new Set(allIds.filter((id) => !withPeople.has(id)))
}
