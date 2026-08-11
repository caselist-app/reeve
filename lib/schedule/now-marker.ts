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
//
// BROADCAST DAY (REE-114). The grid renders a broadcast day [04:00, +1 04:00)
// shifted onto one literal calendar day, so "now" has to be placed in that same
// grid space, not against the real wall clock. Now is shifted with toGridInstant
// before both the on-day check and the position: a real 01:00 during tonight's
// show sits near the bottom of tonight's grid, not off the top of tomorrow's.
// The label, though, is the real wall clock (01:00), because that is the time it
// actually is. Position from the shifted instant, label from the real one.

import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'
import { toGridInstant } from '@/lib/schedule/day-window'

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
 * Returns null unless `nowIso` falls on `viewedDate`'s broadcast day in the tour
 * zone, so the label only appears on today's grid. The day comparison is the
 * whole reason this is not inlined: it must be the tour-local broadcast day, so
 * a real 01:00 that is tonight's small hours (and a different calendar date, in
 * UTC or the tour zone) still marks this day.
 */
export function nowMarker(
  nowIso: string,
  timezone: string,
  viewedDate: string,
): NowMarker | null {
  // Shift now onto the broadcast grid. Its grid instant falls on viewedDate's
  // calendar day exactly when now is within viewedDate's broadcast day.
  const gridNow = toGridInstant(nowIso, timezone)
  if (localDateInZone(gridNow, timezone) !== viewedDate) return null

  // Position from the shifted (grid) wall clock, so the marker lines up with the
  // grid RBC drew; label from the real wall clock, so it reads the true time.
  const [hours, minutes] = localTimeInZone(gridNow, timezone).split(':').map(Number)
  const topPercent = ((hours + minutes / 60) / 24) * 100

  return { topPercent, label: localTimeInZone(nowIso, timezone) }
}
