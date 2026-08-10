// Brief 43 step 4 (REE-55). The pure seam between fetchDayRecords and the
// react-big-calendar grid: it turns a day's records into exactly what the grid
// renders, and it holds every decision that a test can assert.
//
// It exists as its own module, rather than living inside day-calendar.tsx,
// because that component imports react-big-calendar and its stylesheet, and
// neither survives being imported into a Node test (there is no jsdom and no CSS
// loader). Everything provable about this step is provable here: the three
// sources become events, an untimed record is set aside rather than dropped, and
// a failed read becomes a message rather than a blank grid.
//
// It asks nothing about which day a record is on. It hands the instants to the
// adapter, which hands them to RBC, and RBC (through the zoned localizer) is the
// only thing that decides a day. See lib/schedule/calendar-adapter.ts.

import {
  toCalendarEvents,
  type CalendarEvent,
  type UnpositionedRecord,
} from '@/lib/schedule/calendar-adapter'
import type { DayRecords } from '@/lib/schedule/day-records'

// Shown when the day_items read failed. A failed read is not an empty day:
// "nothing here" is a confident, plausible, wrong answer, and it is what a crew
// member got when a query failed. The grid draws its hours whether or not
// anything is on them, so an empty grid alone cannot carry this: the message has
// to be explicit. Same rule the crew-facing templates and the old timeline
// followed.
export const COULD_NOT_LOAD_MESSAGE = 'Could not load this day. Refresh to try again.'

export interface DayCalendarView {
  // Positioned on the grid: everything with a start instant.
  events: CalendarEvent[]
  // Has no start instant, so it cannot be placed on a time grid. Rendered in the
  // "No time set" rail above the grid rather than dropped. After Brief 42 a show
  // can be created with no times at all, so a rail full of these is the normal
  // state of a fresh day.
  unpositioned: UnpositionedRecord[]
  // Transport departing in the next morning's small hours, shown as a list below
  // the grid. RBC's day view has nowhere for 01:30 tomorrow (Brief 43 decision
  // 1), so the tail stays a list. Only transport is here: a day_item that crosses
  // midnight carries this day's tour_date_id and is not in fetchDayRecords'
  // lateNight bucket.
  lateNight: CalendarEvent[]
  // Non-null only when the day_items read failed. The component shows it and
  // still renders whatever else loaded, so a transport-only day is not hidden by
  // a times failure.
  errorMessage: string | null
}

/**
 * Everything the day grid renders, derived from one day's records.
 *
 * The three positioned sources (day_items, segments, hotels) go through the
 * adapter together, so an untimed member of any of them lands in `unpositioned`
 * by the same rule. The late-night transport tail goes through the adapter on
 * its own, because it renders as a list rather than on the grid, but it is the
 * same mapping so its titles and icons match.
 */
export function buildDayCalendarView(records: DayRecords, timezone: string): DayCalendarView {
  const { events, unpositioned } = toCalendarEvents(
    { items: records.items, segments: records.segments, hotels: records.hotels },
    { timezone },
  )

  // The tail is transport only, and it is a separate fetch (next morning's
  // departures) rather than a slice of `segments`, so it cannot double-count a
  // segment already on the grid.
  const { events: lateNight } = toCalendarEvents(
    { items: [], segments: records.lateNight.segments, hotels: [] },
    { timezone },
  )

  return {
    events,
    unpositioned,
    lateNight,
    errorMessage: records.itemsError ? COULD_NOT_LOAD_MESSAGE : null,
  }
}
