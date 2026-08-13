import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'
import { localDayWindowUtc } from '@/lib/schedule/datetime'
import { localBroadcastDayWindowUtc } from '@/lib/schedule/day-window'
import { emptyPartyIds } from '@/lib/party/empty-flag'
import {
  fetchContinuingDayItems,
  fetchDayItems,
  type DayItem,
} from '@/lib/schedule/day-items'

// Single source of truth for a schedule day's records. The day view used to
// fetch this set two to three times per navigation (the page for panel data,
// the timeline for display, the info panel for the show). It is now fetched
// once here and passed down as props.
//
// Brief 42, REE-17. A day's times are rows in day_items now, not twenty fixed
// columns on one show row plus a separate freeform-events fetch. Two queries
// became one, and the show stopped being the thing a time hangs off.

type Client = Awaited<ReturnType<typeof createClient>>

// catering_type is on shows since REE-19: it is the one old day-sheet column
// that was not a time and had no row to become.
export type DayShow = Pick<
  Tables<'shows'>,
  | 'id' | 'venue_name' | 'address' | 'capacity' | 'venue_type' | 'catering_type'
  | 'venue_lat' | 'venue_lng'
>

export type DaySegment = Pick<
  Tables<'transport_segments'>,
  | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
  | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
  // Brief 31 (AirLabs): flight-only live tracking fields.
  | 'origin_iata' | 'destination_iata' | 'flight_status'
  | 'actual_depart_at' | 'actual_arrive_at' | 'gate' | 'terminal' | 'last_tracked_at'
>

export type DayHotel = Pick<
  Tables<'hotel_stays'>,
  | 'id' | 'name' | 'address'
  | 'check_in_date' | 'check_in_time'
  | 'check_out_date' | 'check_out_time'
  | 'wifi_network' | 'wifi_password'
>

// A stay renders once per event it produces on a day: a check-in card on its
// check-in day, a check-out card on its check-out day. Merged here rather than
// in the timeline, so "which hotels are on this day" has one answer in one
// place. Brief 36 Part 1: the old three-bucket shape let an edited stay be
// rejected by every bucket and render on no day at all.
export type DayHotelItem = DayHotel & { isCheckout: boolean }

export interface DayRecords {
  shows: DayShow[]
  items: DayItem[]                // every time on this day, ordered as shown
  // A failed read is not an empty day. "Nothing added to this day yet" is a
  // confident, plausible, wrong answer, and it is what a crew member got when a
  // query failed. The timeline says it could not load instead.
  itemsError: string | null
  segments: DaySegment[]          // deduped union of tour_date-linked and date-matched
  hotels: DayHotelItem[]          // check-ins and check-outs falling on this day
  // Blocks filed on a PREVIOUS broadcast day whose stated end reaches past this
  // day's 04:00 start, so they break over the boundary (REE-124). A second view
  // of those rows, drawn read-only and clamped to the grid top on this day, NOT
  // a reassignment: they stay filed on the day they start. Kept separate from
  // `items`/`segments` so "which day is this record on" still has one answer,
  // and out of the roster so a previous night's overnight drive does not add its
  // passengers to this day. Hotels are excluded by scope: a stay stays discrete
  // check-in/check-out point events, never a bar across its nights.
  continuedFromPrev: { items: DayItem[]; segments: DaySegment[] }
  // Ids of the segments and hotels on this day, used by the info panel to
  // resolve the day's roster without re-querying for them.
  segmentIds: string[]
  hotelStayIds: string[]
  // REE-170: ids of every segment or hotel stay rendered on this day (including
  // a continuation drawn from a previous broadcast day) with zero attached
  // people, for the day view to flag. Every mode counts, including truck: this
  // is a display flag only and never blocks a save, so it carries no relation
  // to lib/validators.
  emptyPartySegmentIds: string[]
  emptyPartyHotelIds: string[]
}

const EMPTY: DayRecords = {
  shows: [],
  items: [],
  itemsError: null,
  segments: [],
  hotels: [],
  continuedFromPrev: { items: [], segments: [] },
  segmentIds: [],
  hotelStayIds: [],
  emptyPartySegmentIds: [],
  emptyPartyHotelIds: [],
}

// A plain column list now, with no embed. This string used to be one of the two
// untyped sources of truth for a day-sheet field: nothing but a running query
// would tell you it was wrong. There is nothing left in it to get wrong.
const SHOW_SELECT =
  'id, venue_name, address, capacity, venue_type, catering_type, venue_lat, venue_lng'

const SEGMENT_SELECT =
  'id, mode, origin, destination, depart_at, arrive_at, carrier_operator, vehicle_or_flight_no, booking_reference, status, origin_iata, destination_iata, flight_status, actual_depart_at, actual_arrive_at, gate, terminal, last_tracked_at'

const HOTEL_SELECT =
  'id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password'

export async function fetchDayRecords(
  supabase: Client,
  {
    tourId,
    tourDateId,
    date,
    timezone,
    // Required, not optional. Transport is placed by a tour-local day window,
    // so a caller that omits this silently gets UTC boundaries and a segment
    // near either end of the day lands on the wrong one. Making it optional
    // meant forgetting it compiled fine, which is how this bug class returns.
    // Pass `tour.timezone ?? 'UTC'`, the way the schedule route already does.
  }: { tourId: string; tourDateId: string | null; date: string; timezone: string | null },
): Promise<DayRecords> {
  // Off-calendar dates have no tour_date row, so there is nothing on the day
  // and the timeline is not rendered. Notes are tour_dates.notes now, so a date
  // with no row has none either, and typing one adds the day (updateDayNotes).
  if (!tourDateId) return EMPTY

  // Transport is sourced from the broadcast day, not the calendar day (REE-111).
  // Transport is fetched across the calendar day extended forward to the next
  // broadcast boundary: [date 00:00, date+1 04:00) in the tour's timezone.
  // depart_at is a timestamptz, so this is derived in the tour's zone; falls back
  // to UTC when the tour has none, like every other date-deriving path. Only
  // transport reads from here: day_items stay fetched by tour_date_id and hotels
  // by their date columns.
  //
  // Two halves, deliberately:
  //   - the calendar start (date 00:00) keeps this day's OWN pre-dawn departures
  //     in the fetch. On the broadcast grid a 01:30 drive stored on this date
  //     belongs to the previous night, so buildDayCalendarView shifts it before
  //     00:00 and rails it under "Outside this day" rather than dropping it.
  //   - the broadcast end (date+1 04:00) pulls the next morning's small hours
  //     onto this day, so a 02:00 overnight drive after tonight's show, stored on
  //     the next calendar date, lands in `segments` and the grid renders it on the
  //     night it follows via the DAY_START_HOUR shift.
  const dayWindow = localDayWindowUtc(date, timezone ?? 'UTC')
  const broadcastWindow = localBroadcastDayWindowUtc(date, timezone ?? 'UTC')
  const transportWindow = { start: dayWindow.start, end: broadcastWindow.end }

  const [
    { data: showRows },
    dayItems,
    continuingItems,
    { data: linkedSegments },
    { data: datedSegments },
    { data: continuingSegmentRows },
    { data: checkinHotels },
    { data: checkoutHotels },
  ] = await Promise.all([
    supabase.from('shows').select(SHOW_SELECT).eq('tour_id', tourId).eq('tour_date_id', tourDateId),

    // The day's times, in one read of one table. This replaces the old day-sheet
    // embed above and the separate freeform-events fetch that used to sit below,
    // and it is the point of the brief: a load-in, a second soundcheck and a
    // press call are the same kind of thing now.
    fetchDayItems(supabase, { tourId, tourDateId }),

    // Items filed on a previous day that break over this day's 04:00 start and
    // continue into it (REE-124). An instant-window read, kept out of `items`:
    // this is a second view of those rows on this grid, not a reassignment.
    fetchContinuingDayItems(supabase, {
      tourId,
      tourDateId,
      broadcastStart: broadcastWindow.start,
    }),

    // Linked segments are date-guarded too, but in JS below rather than here.
    // One day's segments are a handful of rows, and expressing "null or inside
    // the window" as a PostgREST or() filter means hand-building a filter
    // string whose correctness cannot be checked by the compiler. Fetching by
    // the link and filtering after is the same result for a cost that does not
    // matter, and it can be read and verified without a database.
    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .eq('tour_date_id', tourDateId),

    // Unlinked fallback: segments created before tour_date_id was backfilled,
    // or via the planner, where show_id was the link instead.
    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .is('tour_date_id', null)
      .gte('depart_at', transportWindow.start)
      .lt('depart_at', transportWindow.end),

    // Segments that departed on a PREVIOUS broadcast day but whose arrival
    // reaches past this day's 04:00 start, so they break over the boundary
    // (REE-124). depart_at before the broadcast start, arrive_at after it, and a
    // stated arrival (a null arrival cannot span). This is the smallest of the
    // three continuation reads because transport is already an instant query;
    // it just looks the other way across the boundary. Deduped below against the
    // segments already on this day (a 02:00 departure sits in both windows).
    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .not('arrive_at', 'is', null)
      .lt('depart_at', broadcastWindow.start)
      .gt('arrive_at', broadcastWindow.start),

    // Hotels are matched on date alone, linked or not. The old shape queried
    // linked stays by tour_date_id and unlinked ones by date, so an edited stay
    // could be excluded by both, and a linked multi-night stay never rendered a
    // check-out card because it was only ever fetched for its check-in day.
    // Now that every write keeps check_in_date and the link in step, the date is
    // sufficient on its own and cannot miss.
    supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .eq('check_in_date', date),

    supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .eq('check_out_date', date)
      .neq('check_in_date', date), // avoid duplicating same-day check-in/out
  ])

  // The date guard the linked query used to be missing entirely. A segment
  // moved to another day kept its stale link and so stayed on this one, showing
  // the new day's time. A segment with no departure time at all keeps its link
  // as the only thing placing it, so it is not filtered out. Guarded by the
  // transport window (calendar start, broadcast end) so a linked 02:00 drive
  // after tonight's show, whose depart_at is on the next calendar date, is kept
  // rather than dropped.
  const windowStart = new Date(transportWindow.start).getTime()
  const windowEnd = new Date(transportWindow.end).getTime()

  const linkedOnThisDay = (linkedSegments ?? []).filter((s) => {
    if (!s.depart_at) return true
    const departs = new Date(s.depart_at).getTime()
    return departs >= windowStart && departs < windowEnd
  })

  // Deduplicate transport segments by id (linked + unlinked fallback).
  const segMap = new Map<string, DaySegment>()
  for (const s of [...linkedOnThisDay, ...(datedSegments ?? [])]) segMap.set(s.id, s)

  // The roster (segmentIds) answers "who is on this day", and it stays on the
  // calendar day: a next-morning overnight drive is in `segments` so the
  // broadcast grid can render it on the night it follows, but its passengers are
  // travelling the next date and are not part of this day's party. A departure
  // inside the calendar day, or a linked segment with no departure at all (placed
  // by its link), counts.
  const calendarStart = new Date(dayWindow.start).getTime()
  const calendarEnd = new Date(dayWindow.end).getTime()
  const onCalendarDay = (s: DaySegment): boolean => {
    if (!s.depart_at) return true
    const departs = new Date(s.depart_at).getTime()
    return departs >= calendarStart && departs < calendarEnd
  }

  // Continuation segments, deduped against the ones already placed on this day.
  // A segment departing at, say, 02:00 today sits in both the transport window
  // (its depart_at is inside [date 00:00, date+1 04:00)) and the continuation
  // window (it departs before 04:00 and arrives after), so it would otherwise be
  // counted twice: once as this day's own record, once as a continuation. The
  // day's own placement wins; the continuation view is only for rows filed on a
  // genuinely earlier day.
  const continuingSegments = (continuingSegmentRows ?? []).filter((s) => !segMap.has(s.id))

  // One entry per card. A same-day check-in and check-out is excluded from the
  // check-out query above, so a stay cannot produce two cards for one event.
  const hotels: DayHotelItem[] = [
    ...(checkinHotels ?? []).map((h) => ({ ...h, isCheckout: false })),
    ...(checkoutHotels ?? []).map((h) => ({ ...h, isCheckout: true })),
  ]

  // REE-170: which of the segments and hotels drawn on this day (including a
  // continuation projected from the previous broadcast day) have nobody
  // attached, so the day view can flag them. Guarded against an empty `.in()`
  // per CLAUDE.md; run after the ids above are known, so it cannot join the
  // first Promise.all. Errors are swallowed to an empty result the same way
  // fetchDayRoster already does for this same pair of tables: this is a
  // display flag, not a crew-facing answer, so a failed read here degrades to
  // "nothing flagged" rather than needing its own error surface.
  const allSegmentIds = [...segMap.keys(), ...continuingSegments.map((s) => s.id)]
  const allHotelIds = Array.from(new Set(hotels.map((h) => h.id)))

  const [{ data: segAssignments }, { data: hotelAssignments }] = await Promise.all([
    allSegmentIds.length > 0
      ? supabase.from('transport_assignments').select('segment_id').eq('tour_id', tourId).in('segment_id', allSegmentIds)
      : Promise.resolve({ data: [] as { segment_id: string }[] }),
    allHotelIds.length > 0
      ? supabase.from('room_assignments').select('hotel_stay_id').eq('tour_id', tourId).in('hotel_stay_id', allHotelIds)
      : Promise.resolve({ data: [] as { hotel_stay_id: string }[] }),
  ])

  const emptyPartySegmentIds = Array.from(
    emptyPartyIds(allSegmentIds, (segAssignments ?? []).map((a) => a.segment_id)),
  )
  const emptyPartyHotelIds = Array.from(
    emptyPartyIds(allHotelIds, (hotelAssignments ?? []).map((a) => a.hotel_stay_id)),
  )

  return {
    shows: showRows ?? [],
    items: dayItems.items,
    itemsError: dayItems.error,
    segments: Array.from(segMap.values()),
    hotels,
    continuedFromPrev: {
      items: continuingItems.items,
      segments: continuingSegments,
    },
    // Roster: calendar-day segments only, so a next-morning overnight drive that
    // is in `segments` for the grid does not add its passengers to this day.
    segmentIds: Array.from(segMap.values()).filter(onCalendarDay).map((s) => s.id),
    // Deduplicated: a stay checking in and out across this day would otherwise
    // contribute its occupants to the roster twice.
    hotelStayIds: Array.from(new Set(hotels.map((h) => h.id))),
    emptyPartySegmentIds,
    emptyPartyHotelIds,
  }
}
