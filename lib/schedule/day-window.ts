// Broadcast-day primitives for the schedule day view (REE-111, step 1 of 6).
//
// A tour manager's "day" is not a calendar day. A 21:00 show, a 01:00 curfew and
// a 02:00 overnight drive are all part of the same working night, yet the last
// two fall on the next calendar date. RBC's day view is hard-locked to one
// calendar day: TimeGrid.renderDayColumn collapses min/max onto the calendarDate
// via localizer.merge (keeping only the time of day) and filters events with
// inRange(date, start, end, 'day'), so the grid cannot natively span midnight.
//
// The workaround these helpers exist for: define the working day as a "broadcast
// day" running [04:00, 04:00 next date) in the tour timezone, then shift every
// real instant back by the day-start offset so the broadcast day maps onto one
// literal calendar day (dayDate 00:00 -> 24:00). RBC renders that literal day;
// callers shift back for every label, gesture and persisted value.
//
// These are pure functions and nothing calls them yet. Rendering and fetch
// changes are later steps. DST-transition correctness is step 5: on a normal day
// the shift is exactly DAY_START_HOUR hours, and the round-trip is exact
// regardless because both directions read the same derived offset.
//
// No luxon here, deliberately: the day boundary is authored on the zone helpers
// in datetime.ts, not the calendar localizer, per the checked containment rule.

import { addDays, localDayWindowUtc, wallClockToUtc } from '@/lib/schedule/datetime'

/**
 * Where one working day ends and the next begins, as an hour of the tour-local
 * clock. An item before this hour on its own date belongs to the *previous*
 * broadcast day.
 *
 * 04:00 is the earliest hour that still keeps the show tail (curfew to ~01:00,
 * load-out to ~03:00) attached to tonight. Later would start pulling a genuine
 * early-morning lobby call backwards onto the previous day, which is the more
 * dangerous mis-filing of the two. One tunable constant, possibly per-tour later.
 */
export const DAY_START_HOUR = 4

// `HH:00` for DAY_START_HOUR, padded, so the constant drives the boundary
// instead of a hardcoded '04:00' scattered across the helpers below.
const DAY_START_HHMM = `${String(DAY_START_HOUR).padStart(2, '0')}:00`

/**
 * The half-open UTC window `[start, end)` covering one broadcast day: from
 * `date` at DAY_START_HOUR in the tour timezone to the next date at the same
 * hour. This is the broadcast-day analogue of `localDayWindowUtc`, and it is
 * what a fetch filters by so a 01:00 curfew and a 02:00 drive on `date + 1`
 * come back with `date`'s night rather than the following one.
 */
export function localBroadcastDayWindowUtc(
  date: string,
  timezone: string,
): { start: string; end: string } {
  return {
    start: wallClockToUtc(`${date}T${DAY_START_HHMM}`, timezone),
    end: wallClockToUtc(`${addDays(date, 1)}T${DAY_START_HHMM}`, timezone),
  }
}

/**
 * Milliseconds to subtract from a real instant to place it in the synthetic
 * grid day, i.e. the delta between the broadcast-window start (dayDate
 * DAY_START_HOUR) and dayDate 00:00, both in the tour timezone. Exactly
 * DAY_START_HOUR hours on a normal day; derived rather than assumed so the pair
 * of shift helpers stays an exact inverse across whatever the zone reports.
 */
function gridShiftMs(date: string, timezone: string): number {
  const broadcastStart = new Date(localBroadcastDayWindowUtc(date, timezone).start).getTime()
  const midnight = new Date(localDayWindowUtc(date, timezone).start).getTime()
  return broadcastStart - midnight
}

/**
 * Map a real UTC instant into the synthetic calendar-day grid for `date`.
 *
 * The broadcast window `[dayDate 04:00, dayDate+1 04:00)` is shifted back onto
 * the literal calendar day `[dayDate 00:00, dayDate+1 00:00)` that RBC can
 * render: a 04:00 start lands at 00:00, a 21:00 show at 17:00, a 01:00 curfew
 * (next date) at 21:00, a 02:00 drive (next date) at 22:00.
 */
export function toGridInstant(realIso: string, date: string, timezone: string): string {
  return new Date(new Date(realIso).getTime() - gridShiftMs(date, timezone)).toISOString()
}

/**
 * The exact inverse of `toGridInstant`: map a grid instant back to the real UTC
 * instant it stands for. Used for every label, gesture result and persisted
 * value once a gesture has happened in grid space.
 */
export function fromGridInstant(gridIso: string, date: string, timezone: string): string {
  return new Date(new Date(gridIso).getTime() + gridShiftMs(date, timezone)).toISOString()
}
