// Brief 43 step 4 (REE-55), reworked for the broadcast-day grid (REE-111 step 3,
// REE-114). The pure seam between fetchDayRecords and the react-big-calendar
// grid: it turns a day's records into exactly what the grid renders, and it holds
// every decision that a test can assert.
//
// It exists as its own module, rather than living inside day-calendar.tsx,
// because that component imports react-big-calendar and its stylesheet, and
// neither survives being imported into a Node test (there is no jsdom and no CSS
// loader). Everything provable about this step is provable here: the three
// sources become events, an untimed record is set aside rather than dropped, a
// failed read becomes a message rather than a blank grid, and now, the broadcast
// shift and the "Outside this day" partition.
//
// THE BROADCAST-DAY SHIFT LIVES HERE, not in the adapter. A TM's working day is
// not a calendar day: a 21:00 show, a 01:00 curfew and a 02:00 overnight drive
// are one night, yet the last two fall on the next calendar date. RBC's day view
// is hard-locked to one calendar day, so the workaround (REE-112) defines a
// "broadcast day" [04:00, +1 04:00) in the tour zone and shifts every real
// instant back onto the literal calendar day [00:00, +1 00:00) that RBC can
// render. The adapter maps rows to events in REAL space; this seam then rewrites
// each event's start/end into that grid space via toGridInstant and keeps the
// real instants on realStart/realEnd for labels and click-through. Keeping the
// shift out of the adapter keeps it a pure instant->instant mapper and keeps
// fromDropOrResize (the write path's data-protecting core) working in real space.
//
// It still asks nothing about which day a record is on: toGridInstant is a
// wall-clock shift by DAY_START_HOUR hours, not a day derivation. resolveTourDateId
// and localDateInZone remain the only authorities on that. See
// lib/schedule/calendar-adapter.ts and lib/schedule/day-window.ts.

import {
  toCalendarEvents,
  type CalendarEvent,
  type UnpositionedRecord,
} from '@/lib/schedule/calendar-adapter'
import { localDayWindowUtc } from '@/lib/schedule/datetime'
import { toGridInstant } from '@/lib/schedule/day-window'
import type { DayRecords } from '@/lib/schedule/day-records'

// Shown when the day_items read failed. A failed read is not an empty day:
// "nothing here" is a confident, plausible, wrong answer, and it is what a crew
// member got when a query failed. The grid draws its hours whether or not
// anything is on them, so an empty grid alone cannot carry this: the message has
// to be explicit. Same rule the crew-facing templates and the old timeline
// followed.
export const COULD_NOT_LOAD_MESSAGE = 'Could not load this day. Refresh to try again.'

export interface DayCalendarView {
  // Positioned on the grid: everything whose shifted start falls inside the
  // broadcast day. start/end are grid-space instants; realStart/realEnd hold the
  // real wall clock.
  events: CalendarEvent[]
  // Has no start instant, so it cannot be placed on a time grid. Rendered in the
  // "No time set" rail above the grid rather than dropped. After Brief 42 a show
  // can be created with no times at all, so a rail full of these is the normal
  // state of a fresh day.
  unpositioned: UnpositionedRecord[]
  // Has a start, but its shifted instant falls OUTSIDE the broadcast day the grid
  // renders (e.g. a 03:00 item whose tour_date_id is this day: 03:00 is before
  // the 04:00 broadcast start, so it belongs to the previous night's grid). RBC
  // would filter it off the column silently; the never-drop principle REE-111
  // surfaced says show it instead. Rendered in an "Outside this day" rail, still
  // clickable, with its real wall-clock time. This is the broadcast-grid successor
  // to the old "After midnight" tail: a past-midnight drive is now ON the grid,
  // so the tail is gone, and only genuinely off-window records land here.
  outsideDay: CalendarEvent[]
  // Non-null only when the day_items read failed. The component shows it and
  // still renders whatever else loaded, so a transport-only day is not hidden by
  // a times failure.
  errorMessage: string | null
}

// A real event rewritten into synthetic grid space. start/end are shifted;
// realStart/realEnd preserve the real instants. Both ends shift by the same
// wall-clock amount, so a synthesised 30-minute block stays 30 minutes off a
// DST-transition day and fromDropOrResize's duration logic is untouched.
function toGridEvent(event: CalendarEvent, timezone: string): CalendarEvent {
  return {
    ...event,
    start: new Date(toGridInstant(event.start.toISOString(), timezone)),
    end: new Date(toGridInstant(event.end.toISOString(), timezone)),
    realStart: event.start,
    realEnd: event.end,
  }
}

/**
 * Everything the day grid renders, derived from one day's records.
 *
 * The three positioned sources (day_items, segments, hotels) go through the
 * adapter together in real space, then each event is shifted onto the broadcast
 * grid. An event whose shifted start lands inside the grid's calendar day is
 * positioned; one that lands outside goes to the "Outside this day" rail rather
 * than being dropped. An untimed record from any source is set aside in
 * `unpositioned` by the adapter's own rule.
 *
 * A block that breaks over the 04:00 boundary is drawn on both days (REE-124).
 * On the day it starts it is tagged `continuesAfter` (RBC clamps its height to
 * the grid bottom); on the day it continues into it arrives via
 * `records.continuedFromPrev`, is clamped to the grid top and tagged
 * `continuesBefore` as a read-only second view of the same row. Hotels are out
 * of scope: a stay stays discrete check-in/check-out point events.
 *
 * @param date the viewed day, YYYY-MM-DD. The on-grid window is derived for this
 *   day in `timezone` (the caller's resolved zone: the day's own show, then the
 *   tour, then UTC, REE-246); the shift itself is intrinsic to each instant.
 */
export function buildDayCalendarView(
  records: DayRecords,
  timezone: string,
  date: string,
): DayCalendarView {
  const { events: realEvents, unpositioned } = toCalendarEvents(
    { items: records.items, segments: records.segments, hotels: records.hotels },
    { timezone },
  )

  // The grid renders the literal calendar day [dayDate 00:00, +1 00:00), which is
  // exactly the broadcast day once shifted. An event belongs on the grid when its
  // shifted start falls in that window; otherwise it is off-window and railed.
  const window = localDayWindowUtc(date, timezone)
  const gridStart = new Date(window.start).getTime()
  const gridEnd = new Date(window.end).getTime()

  const events: CalendarEvent[] = []
  const outsideDay: CalendarEvent[] = []
  for (const real of realEvents) {
    const grid = toGridEvent(real, timezone)
    const startMs = grid.start.getTime()
    if (startMs >= gridStart && startMs < gridEnd) {
      // A block whose shifted end runs past the grid bottom breaks over the
      // 04:00 boundary into the next broadcast day (REE-124). RBC already clamps
      // its drawn height to the grid; tag it so the component can add the
      // "continues" tell and so it can also render on the next day's grid.
      if (grid.end.getTime() > gridEnd) grid.continuesAfter = true
      events.push(grid)
    } else {
      outsideDay.push(grid)
    }
  }

  // Blocks filed on a PREVIOUS broadcast day that break over the boundary into
  // this one (REE-124). Fetched separately (records.continuedFromPrev) so they
  // never move which day the row belongs to; here they are a read-only second
  // view, clamped to the grid top and tagged `continuesBefore`. Hotels are out
  // of scope by design, so only items and segments arrive in this field.
  const seen = new Set(events.map((e) => e.id))
  for (const outside of outsideDay) seen.add(outside.id)
  const { events: continuationReal } = toCalendarEvents(
    {
      items: records.continuedFromPrev.items,
      segments: records.continuedFromPrev.segments,
      hotels: [],
    },
    { timezone },
  )
  for (const real of continuationReal) {
    const grid = toGridEvent(real, timezone)
    // A row already on this grid (its own placement or the "Outside this day"
    // rail) must not also draw as a continuation of itself. The fetch dedupes
    // segments by id; this guards the rest.
    if (seen.has(grid.id)) continue
    seen.add(grid.id)
    // The real start is before this day's broadcast start, so the shifted start
    // lands above the grid; clamp it to the top and mark that it began earlier.
    // realStart/realEnd keep the true instants for the label and click-through.
    grid.start = new Date(gridStart)
    grid.continuesBefore = true
    // A block long enough to also run off the bottom (rare: it spans the whole
    // day and out the far side) continues in both directions.
    if (grid.end.getTime() > gridEnd) grid.continuesAfter = true
    events.push(grid)
  }

  return {
    events,
    unpositioned,
    outsideDay,
    errorMessage: records.itemsError ? COULD_NOT_LOAD_MESSAGE : null,
  }
}
