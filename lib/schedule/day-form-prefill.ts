import { localTimeInZone } from '@/lib/schedule/datetime'

// The grid step. A slot time is snapped to it so a dragged edge that lands a few
// pixels off a line still seeds a whole quarter hour, the same granularity the
// grid draws. Snapping the instant is snapping the wall clock: every timezone
// this product cares about is a whole number of 15-minute steps off UTC.
const FIFTEEN_MIN_MS = 15 * 60 * 1000

function snapToQuarterHour(ms: number): number {
  return Math.round(ms / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS
}

export interface SlotClocks {
  startClock: string
  endClock: string | null
}

/**
 * The day form's Starts/Ends pre-fill for a selection on the empty grid (REE-56,
 * REE-69). Both are 24-hour "HH:MM" in the tour zone, the exact value the
 * dedicated time inputs read and write, so there is no meridiem to guess:
 * REE-282 gave the day form its own Starts/Ends fields specifically so a
 * clicked time lands in them directly rather than as text in the type field the
 * TM had to type the rest of the line around.
 *
 * A click seeds only the start: a click states no duration, so inventing an end
 * would put a range in front of the TM they never drew. A drag ('select') that
 * spans real time seeds both ends, so the duration the TM dragged survives into
 * the saved item instead of collapsing to the kind's synthesised end.
 *
 * Both ends are snapped to the quarter hour and the range is dropped back to a
 * bare start when the snap leaves nothing between them, so a tiny drag inside one
 * slot behaves like a click rather than seeding a zero-length range.
 */
export function slotToDayFormClocks(
  start: Date,
  end: Date | null,
  action: 'select' | 'click' | 'doubleClick',
  timezone: string,
): SlotClocks {
  const snappedStart = snapToQuarterHour(start.getTime())
  const startClock = localTimeInZone(new Date(snappedStart).toISOString(), timezone)

  if (action !== 'select' || !end) return { startClock, endClock: null }

  const snappedEnd = snapToQuarterHour(end.getTime())
  if (snappedEnd <= snappedStart) return { startClock, endClock: null }

  const endClock = localTimeInZone(new Date(snappedEnd).toISOString(), timezone)
  return { startClock, endClock }
}
