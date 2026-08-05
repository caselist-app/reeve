import type { Json } from '@/lib/types/database'

/**
 * Reads the show a planner-created record was booked against.
 *
 * The hotel and travel planners both stash the show id inside the record's raw
 * provider payload rather than in a column: `hotel_stays.room_types_json` and
 * `transport_segments.details_json`, both shaped `{ raw, show_id }`. Records a
 * TM creates by hand from the schedule have no provider payload, so the column
 * defaults to `{}` and this correctly returns null.
 *
 * One reader for both, deliberately. The hotels overview parsed it and the
 * transport overview hardcoded null, which silently disabled the planner link
 * on every segment row (Brief 36 Part 3). Two copies of this is how that
 * happened, so there is one.
 */
export function showIdFromPlannerPayload(json: Json): string | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const payload = json as Record<string, unknown>
  return typeof payload.show_id === 'string' ? payload.show_id : null
}
