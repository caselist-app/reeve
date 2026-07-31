// Fallback for every route under a specific tour other than
// /tours/[id]/schedule (people, settings, shows/[showId], transport,
// hotels, etc). The Dates panel only has an override at
// @secondaryPanel/tours/[id]/schedule/, everything else here renders null.
export default function Default() {
  return null
}
