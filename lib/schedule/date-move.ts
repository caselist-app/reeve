// Brief 36 Part 1 follow-up: telling the TM the thing moved.
//
// Part 1 fixed the data and created a UX problem doing it. Before Part 1,
// editing a flight's date left it on the day you were looking at showing the new
// time: wrong, but visible. After Part 1 it correctly moves to the day it
// belongs to, so it disappears from the day you are on and nothing says where it
// went. The add flow is the worse half: the panel closes, the timeline in front
// of the TM is unchanged, and there is no trace at all, so the natural reading is
// that the app dropped the record and the natural response is to add it again.
//
// Three things move silently and all three are correct: the record moves to
// another day, a tour_dates row is created if that day was not on the tour, and
// for a show up to twenty day-sheet timestamps move with it.
//
// Two rules make this a feature rather than noise, and both are load bearing:
//
// 1. It only fires when the date actually changed. These actions are called
//    constantly for edits that move nothing, and a toast on all of them trains
//    the TM to dismiss without reading, at which point the one that matters is
//    invisible too.
// 2. The action decides what moved and the client only renders it. The client
//    knows the old date, but only the server knows whether a day was created or
//    whether the day sheet had any times to carry, and both belong in the same
//    sentence.
//
// No undo, deliberately. It is not symmetric: re-calling updateShow with the old
// date restores the record and the day-sheet times, but does not delete the
// tour_dates row that got created and does not restore the old day's day_type
// and custom_title, which revertDayTypeIfOrphaned has already cleared. An undo
// that leaves residue is worse than none, because it looks complete.

/**
 * Where a record moved to, returned by every action that can move one. Present
 * only when the date actually changed, so `moved` being set is itself the
 * "should this be announced" test and no caller has to re-derive it.
 */
export interface DateMove {
  tourId: string
  /** The calendar date (`YYYY-MM-DD`) the record now sits on. */
  date: string
  /** The date was not a day of the tour and a `tour_dates` row was created for it. */
  dayCreated: boolean
  /**
   * Day-sheet timestamps were re-derived onto the new date. Shows only, and only
   * when the sheet actually had times: a show with an empty day sheet must not
   * be announced as having carried times it never had.
   */
  carriedTimes: boolean
}

/**
 * Any action result that can carry a move. Widened rather than tied to the five
 * action state types so `useEntityForm` can announce a move without knowing
 * which action produced it, which is what stops a new panel or add form from
 * silently shipping without the toast.
 */
export interface MaybeMoved {
  moved?: DateMove | null
}

/**
 * A calendar date as a TM reads it: "Sat 15 Jun".
 *
 * Formatted in UTC on purpose. `shows.date` and `hotel_stays.check_in_date` are
 * calendar dates with no timezone of their own, so `new Date('2030-06-15')` is
 * midnight UTC and formatting it in the reader's local zone prints the 14th
 * anywhere west of UTC. That would tell a TM in Los Angeles their show moved to
 * the day before the day it moved to.
 */
export function formatMoveDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/**
 * The one line the toast shows. Clauses are additive so the sentence stays
 * readable when both apply: "Moved to Sat 15 Jun, added to the tour, times moved
 * with it."
 */
export function describeDateMove(move: DateMove): string {
  const parts = [`Moved to ${formatMoveDate(move.date)}`]
  if (move.dayCreated) parts.push('added to the tour')
  if (move.carriedTimes) parts.push('times moved with it')
  return parts.join(', ')
}

/**
 * Where the toast's action takes the TM. The query form, which is what
 * `date-sidebar.tsx` and `date-strip.tsx` already use and what the
 * `[date]/page.tsx` route redirects to.
 */
export function dateMoveHref(move: DateMove): string {
  return `/tours/${move.tourId}/schedule?date=${move.date}`
}
