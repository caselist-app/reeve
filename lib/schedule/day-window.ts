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
// real instant back by DAY_START_HOUR hours of WALL CLOCK so the broadcast day
// maps onto one literal calendar day (dayDate 00:00 -> 24:00). RBC renders that
// literal day; callers shift back for every label, gesture and persisted value.
//
// DST-transition correctness (REE-116, step 5) is why the shift is a wall-clock
// shift and not a fixed millisecond offset. On a spring-forward or fall-back day
// a broadcast window that contains the transition is 23 or 25 real hours, so
// "04:00 minus four hours of elapsed time" is not "00:00": the earlier draft
// subtracted the elapsed real gap between the view date's 00:00 and 04:00 (three
// or five hours on a transition day) as one constant for the whole day, which
// left every block on the far side of the transition an hour out of place, in
// either direction. Shifting the clock instead (04:00 -> 00:00, 21:00 -> 17:00,
// whatever the offset does in between) keeps a block at the grid wall clock its
// gutter label reads, because RBC positions a grid instant by its tour-local
// wall clock (with the localizer's own getDstOffset correction, which this does
// not touch and must not regress: see lib/schedule/calendar-localizer.ts).
//
// The shift is intrinsic to the instant, not to the viewed day, so these take no
// `date`: subtracting four wall hours re-homes a 01:00 curfew on the next
// calendar date onto 21:00 of the night before by itself. An instant outside the
// viewed broadcast day lands on its own grid date and is railed as "Outside this
// day" by buildDayCalendarView, exactly as before.
//
// No luxon here, deliberately: the day boundary is authored on the zone helpers
// in datetime.ts, not the calendar localizer, per the checked containment rule.

import {
  addDays,
  localDateInZone,
  localTimeInZone,
  wallClockToUtc,
} from '@/lib/schedule/datetime'

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
 * The broadcast day, YYYY-MM-DD, a real instant belongs to in the tour timezone.
 *
 * The broadcast-day analogue of `localDateInZone`. An instant is on its own
 * calendar date once it is at or after DAY_START_HOUR, and on the *previous*
 * date when it falls in the small hours before it: a 01:30 curfew or a 02:00
 * overnight drive is the tail of the night before, not the head of a new day.
 *
 * This is what a drag or resize files a transport_segment by, so a block moved
 * from 22:00 to 01:30 within one night keeps the same day rather than silently
 * re-homing to the next calendar date (REE-110). Only a move that crosses the
 * 04:00 boundary changes the day. Derived by comparing the real instant to the
 * broadcast-window start, so it is exact across a DST changeover rather than
 * assuming the offset is a fixed number of hours.
 */
export function localBroadcastDateInZone(realIso: string, timezone: string): string {
  const calendarDate = localDateInZone(realIso, timezone)
  const broadcastStart = localBroadcastDayWindowUtc(calendarDate, timezone).start
  if (new Date(realIso).getTime() < new Date(broadcastStart).getTime()) {
    return addDays(calendarDate, -1)
  }
  return calendarDate
}

const MINUTES_PER_DAY = 24 * 60

/**
 * Shift a real instant by `deltaHours` of WALL-CLOCK time in `timezone`, and
 * return the real instant that lands on.
 *
 * This is the DST-correct core of the grid shift. It is not a fixed millisecond
 * offset: across a changeover a clock hour is not a real hour, so moving the
 * wall clock by four hours can be three or five real hours. Reading the instant
 * as a tour-local wall clock, moving that clock, then re-resolving it to UTC is
 * what makes 04:00 map to 00:00 on both a 23-hour and a 25-hour day, and keeps
 * `toGridInstant` and `fromGridInstant` inverse on any normal instant.
 *
 * Whole-minute resolution, matching `wallClockToUtc`, which every schedule
 * instant already passes through when it is written from a datetime-local field.
 */
function shiftWallClock(realIso: string, deltaHours: number, timezone: string): string {
  const date = localDateInZone(realIso, timezone)
  const [hours, minutes] = localTimeInZone(realIso, timezone).split(':').map(Number)

  let totalMinutes = hours * 60 + minutes + deltaHours * 60
  let dayOffset = 0
  while (totalMinutes < 0) {
    totalMinutes += MINUTES_PER_DAY
    dayOffset -= 1
  }
  while (totalMinutes >= MINUTES_PER_DAY) {
    totalMinutes -= MINUTES_PER_DAY
    dayOffset += 1
  }

  const shiftedDate = addDays(date, dayOffset)
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return wallClockToUtc(`${shiftedDate}T${hh}:${mm}`, timezone)
}

/**
 * Map a real UTC instant into the synthetic calendar-day grid.
 *
 * The broadcast window `[dayDate 04:00, dayDate+1 04:00)` is shifted back onto
 * the literal calendar day `[dayDate 00:00, dayDate+1 00:00)` that RBC can
 * render: a 04:00 start lands at 00:00, a 21:00 show at 17:00, a 01:00 curfew
 * (next date) at 21:00, a 02:00 drive (next date) at 22:00. The shift is by
 * DAY_START_HOUR hours of wall clock, so it stays correct across a DST
 * transition inside the window rather than an hour out beyond it.
 */
export function toGridInstant(realIso: string, timezone: string): string {
  return shiftWallClock(realIso, -DAY_START_HOUR, timezone)
}

/**
 * The inverse of `toGridInstant`: map a grid instant back to the real UTC
 * instant it stands for. Used for every label, gesture result and persisted
 * value once a gesture has happened in grid space. Exact on any instant whose
 * wall clock is unambiguous, which is every instant outside the one skipped or
 * repeated hour of a transition day.
 */
export function fromGridInstant(gridIso: string, timezone: string): string {
  return shiftWallClock(gridIso, DAY_START_HOUR, timezone)
}

/**
 * The calendar date a wall-clock `clock` ('HH:MM') seeds a departure onto when
 * typed or clicked against broadcast day `viewedDate`. A clock before
 * DAY_START_HOUR is the tail of that night, so it lands on the following
 * calendar date, the same as a curfew or overnight drive: a 01:30 drive added
 * while looking at a show's broadcast day is really 01:30 the morning after
 * the show, not 01:30 the same calendar date (REE-280). The click-to-add path
 * already resolves this correctly through fromGridInstant before it is thrown
 * away to a bare clock string; this is what puts it back at the one place the
 * drive and rail add forms turn a viewed day plus a clock into a real date.
 */
export function broadcastDateForClock(viewedDate: string, clock: string): string {
  const hours = Number(clock.slice(0, 2))
  return hours < DAY_START_HOUR ? addDays(viewedDate, 1) : viewedDate
}

/**
 * The inverse of `broadcastDateForClock`: the broadcast day a `datetime-local`
 * wall-clock value (`YYYY-MM-DDTHH:MM`) belongs to. Lets the drive and rail add
 * forms tell whether an edited departure still lands on the broadcast day it
 * was opened from, so DateMoveNotice only warns when the segment is genuinely
 * landing somewhere else rather than firing on every ordinary after-midnight
 * departure that broadcastDateForClock already seeded correctly.
 */
export function broadcastDateOfWallClock(local: string): string {
  const [date, clock] = local.split('T')
  if (!clock) return date
  const hours = Number(clock.slice(0, 2))
  return hours < DAY_START_HOUR ? addDays(date, -1) : date
}
