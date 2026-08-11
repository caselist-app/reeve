import { localTimeInZone } from '@/lib/schedule/datetime'

// The grid step. A slot time is snapped to it so a dragged edge that lands a few
// pixels off a line still seeds a whole quarter hour, the same granularity the
// grid draws. Snapping the instant is snapping the wall clock: every timezone
// this product cares about is a whole number of 15-minute steps off UTC.
const FIFTEEN_MIN_MS = 15 * 60 * 1000

function snapToQuarterHour(ms: number): number {
  return Math.round(ms / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS
}

// A 24-hour "HH:MM" as a 12-hour clock with an explicit meridiem ("07:30" to
// "7:30am", "19:30" to "7:30pm"). The click-to-add time is pre-filled into the
// day form's free-text input, which runs through parseDayItem, and that parser
// reads a bare hour of 1 to 11 as ambiguous and applies a kind's default
// meridiem: "07:30" would come back as 19:30. A dragged time is exact and must
// not be re-guessed, so it is handed over with the meridiem already stated.
export function to12HourClock(hhmm: string): string {
  const [hour, minute] = hhmm.split(':').map(Number)
  const meridiem = hour < 12 ? 'am' : 'pm'
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${String(minute).padStart(2, '0')}${meridiem}`
}

/**
 * The day form pre-fill for a selection on the empty grid (REE-56, REE-69).
 *
 * A click seeds only the start: a click states no duration, so inventing an end
 * would put a range in front of the TM they never drew. A drag ('select') that
 * spans real time seeds a range ("10:00am–11:00am"), so the duration the TM
 * dragged survives into the saved item instead of collapsing to the kind's
 * synthesised end. The parser reads the range exactly as if it had been typed;
 * nothing downstream is special-cased.
 *
 * Both ends are snapped to the quarter hour and the range is dropped back to a
 * bare start when the snap leaves nothing between them, so a tiny drag inside one
 * slot behaves like a click rather than seeding a zero-length range.
 */
export function slotToDayFormInput(
  start: Date,
  end: Date | null,
  action: 'select' | 'click' | 'doubleClick',
  timezone: string,
): string {
  const snappedStart = snapToQuarterHour(start.getTime())
  const startClock = to12HourClock(localTimeInZone(new Date(snappedStart).toISOString(), timezone))

  if (action !== 'select' || !end) return startClock

  const snappedEnd = snapToQuarterHour(end.getTime())
  if (snappedEnd <= snappedStart) return startClock

  const endClock = to12HourClock(localTimeInZone(new Date(snappedEnd).toISOString(), timezone))
  return `${startClock}–${endClock}`
}
