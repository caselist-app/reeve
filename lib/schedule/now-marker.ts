// The "now" marker for the day calendar: where to draw the red current-time
// label in the hour gutter, and what it should read.
//
// This is the maths behind the red hairline RBC already draws. It is split out
// as a pure function so the one part that has gone wrong here before, deciding
// which day an instant falls on, is a unit test rather than a thing proven by
// eye in a running grid.
//
// Both halves go through the tour timezone, never UTC. An instant at 21:00Z on
// 14 June is 09:00 on 15 June in Auckland: it belongs to the 15th's grid and
// reads as 09:00, and deriving either from the UTC clock puts it on the wrong
// day and prints the wrong time. So the day check uses localDateInZone and the
// label uses localTimeInZone, and there is no third notion of the day in here.

import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'

export interface NowMarker {
  // How far down the 00:00-to-24:00 gutter the marker sits, as a percentage.
  // The gutter spans the whole tour-local day, so 09:00 is 9/24, or 37.5.
  topPercent: number
  // The wall-clock label, HH:MM in the tour zone.
  label: string
}

/**
 * The now-marker for a viewed day, or null when now is not that day.
 *
 * @param nowIso    the current instant as a UTC ISO string
 * @param timezone  the tour's IANA timezone
 * @param viewedDate the day the grid is showing, YYYY-MM-DD
 *
 * Returns null unless `nowIso` falls on `viewedDate` in the tour zone, so the
 * label only appears on today's grid. The day comparison is the whole reason
 * this is not inlined: it must be the tour-local day, so an instant that is a
 * different date in UTC but the same date in the tour zone still marks the day.
 */
export function nowMarker(
  nowIso: string,
  timezone: string,
  viewedDate: string,
): NowMarker | null {
  if (localDateInZone(nowIso, timezone) !== viewedDate) return null

  const label = localTimeInZone(nowIso, timezone)
  const [hours, minutes] = label.split(':').map(Number)
  const topPercent = ((hours + minutes / 60) / 24) * 100

  return { topPercent, label }
}
