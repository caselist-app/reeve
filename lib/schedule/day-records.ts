import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'
import { localDayWindowUtc } from '@/lib/schedule/datetime'
import { addDays } from '@/lib/schedule/day-sheet-times'

// Single source of truth for a schedule day's records. The day view used to
// fetch this set two to three times per navigation (the page for panel data,
// the timeline for display, the info panel for the show). It is now fetched
// once here and passed down as props.

type Client = Awaited<ReturnType<typeof createClient>>

export type DayShow = Pick<
  Tables<'shows'>,
  'id' | 'venue_name' | 'address' | 'capacity' | 'venue_type'
> & {
  day_sheets: Pick<
    Tables<'day_sheets'>,
    | 'lobby_call' | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
    | 'doors' | 'support_on' | 'support_off' | 'changeover' | 'headliner_on' | 'headliner_off'
    | 'curfew' | 'load_out'
  > | null
}

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

export type DayEvent = Pick<
  Tables<'day_events'>,
  'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
>

// A stay renders once per event it produces on a day: a check-in card on its
// check-in day, a check-out card on its check-out day. Merged here rather than
// in the timeline, so "which hotels are on this day" has one answer in one
// place. Brief 36 Part 1: the old three-bucket shape let an edited stay be
// rejected by every bucket and render on no day at all.
export type DayHotelItem = DayHotel & { isCheckout: boolean }

// Records belonging to the small hours of the following calendar morning, which
// a TM reads as the end of this day rather than the start of the next one. A
// 01:30 red-eye after a show is the case: it is stored on the 15th, correctly,
// and the TM planning the 14th needs to see it.
//
// Deliberately a separate field rather than merged into `segments` and `events`.
// These records genuinely belong to the next calendar day, they are still
// fetched and rendered by that day, and nothing about where they are stored
// changes. This is a second view of them, not a reassignment. Merging them would
// make "which day is this on" ambiguous again, which is the thing the day link
// exists to settle.
export interface LateNight {
  segments: DaySegment[]
  events: DayEvent[]
}

export interface DayRecords {
  shows: DayShow[]
  segments: DaySegment[]          // deduped union of tour_date-linked and date-matched
  hotels: DayHotelItem[]          // check-ins and check-outs falling on this day
  events: DayEvent[]              // freeform events on this day
  lateNight: LateNight            // next morning's small hours, shown as this day's tail
  // Ids of the segments and hotels on this day, used by the info panel to
  // resolve the day's roster without re-querying for them.
  segmentIds: string[]
  hotelStayIds: string[]
}

const EMPTY: DayRecords = {
  shows: [],
  segments: [],
  hotels: [],
  events: [],
  lateNight: { segments: [], events: [] },
  segmentIds: [],
  hotelStayIds: [],
}

// Where the tail stops. This is a cutoff hour, and the two places this brief
// deliberately refused to put one (the day-sheet write rule, and the definition
// of a day) are the reason to say why it is acceptable here.
//
// Nothing is stored against it and nothing is grouped by it. A record on either
// side of this line lives on exactly the same day it did before, is fetched by
// that day, and renders there. All this decides is whether it ALSO appears at
// the bottom of the previous day. Being wrong shows something in one extra
// place, or fails to, which is a presentation miss the TM can see and correct.
// Being wrong about a stored instant is silent and compounds.
const LATE_NIGHT_ENDS_AT_HOUR = 6

const SHOW_SELECT = `
  id, venue_name, address, capacity, venue_type,
  day_sheets (
    lobby_call, venue_access, load_in, line_check, soundcheck, vip,
    doors, support_on, support_off, changeover, headliner_on, headliner_off,
    curfew, load_out
  )
`

const SEGMENT_SELECT =
  'id, mode, origin, destination, depart_at, arrive_at, carrier_operator, vehicle_or_flight_no, booking_reference, status, origin_iata, destination_iata, flight_status, actual_depart_at, actual_arrive_at, gate, terminal, last_tracked_at'

const HOTEL_SELECT =
  'id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password'

// day_sheets comes back as an array (or object) from the embedded select.
// Normalise it to a single record or null so every consumer reads it the same way.
function flattenDaySheet(raw: unknown): DayShow['day_sheets'] {
  if (Array.isArray(raw)) return (raw[0] as DayShow['day_sheets']) ?? null
  return (raw as DayShow['day_sheets']) ?? null
}

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

  // The UTC window covering this tour-local day. depart_at is a timestamptz, so
  // filtering it against `${date}T00:00:00Z` to the next midnight is only
  // correct for a tour on UTC and silently a day out at the edges for every
  // other one. Falls back to UTC when the tour has no timezone set, which is
  // what every other date-deriving path in the app does.
  const dayWindow = localDayWindowUtc(date, timezone ?? 'UTC')

  // The small hours of the next morning. Starts where this day's window ends,
  // which is next-day midnight in the tour's timezone, so the two are adjacent
  // and cannot overlap: nothing can be both on this day and in its tail.
  const nextDate = addDays(date, 1)
  const nextDayWindow = localDayWindowUtc(nextDate, timezone ?? 'UTC')
  // Six hours of elapsed time from local midnight, not "06:00 local". On a
  // spring-forward night the clocks skip an hour, so this reads as 07:00 local
  // on that one night a year. Left as elapsed time deliberately: converting a
  // wall-clock 06:00 costs another timezone round trip to move a presentational
  // boundary by an hour, on a night when the boundary is genuinely ambiguous
  // anyway.
  const lateNightEnd = new Date(
    new Date(nextDayWindow.start).getTime() + LATE_NIGHT_ENDS_AT_HOUR * 3_600_000,
  ).toISOString()

  const [
    { data: showRows },
    { data: linkedSegments },
    { data: datedSegments },
    { data: checkinHotels },
    { data: checkoutHotels },
    { data: eventRows },
    { data: lateSegmentRows },
    { data: lateEventRows },
  ] = await Promise.all([
    supabase.from('shows').select(SHOW_SELECT).eq('tour_id', tourId).eq('tour_date_id', tourDateId),

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
      .gte('depart_at', dayWindow.start)
      .lt('depart_at', dayWindow.end),

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

    supabase
      .from('day_events')
      .select('id, title, starts_at, ends_at, location, notes')
      .eq('tour_id', tourId)
      .eq('date', date)
      .order('starts_at', { ascending: true }),

    // Tail: departures in the next morning's small hours. Filtered on depart_at
    // alone rather than on the link, because that is the fact being asked about
    // (when does this actually leave) and because it catches planner-created
    // segments, which have no link at all.
    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .gte('depart_at', nextDayWindow.start)
      .lt('depart_at', lateNightEnd),

    // Scoped to the next calendar date as well as the time window. An event's
    // day is its own `date` column, which is already explicit and separate from
    // starts_at, so both have to agree before it counts as this day's tail.
    supabase
      .from('day_events')
      .select('id, title, starts_at, ends_at, location, notes')
      .eq('tour_id', tourId)
      .eq('date', nextDate)
      .gte('starts_at', nextDayWindow.start)
      .lt('starts_at', lateNightEnd)
      .order('starts_at', { ascending: true }),
  ])

  // The date guard the linked query used to be missing entirely. A segment
  // moved to another day kept its stale link and so stayed on this one, showing
  // the new day's time. A segment with no departure time at all keeps its link
  // as the only thing placing it, so it is not filtered out.
  const windowStart = new Date(dayWindow.start).getTime()
  const windowEnd = new Date(dayWindow.end).getTime()

  const linkedOnThisDay = (linkedSegments ?? []).filter((s) => {
    if (!s.depart_at) return true
    const departs = new Date(s.depart_at).getTime()
    return departs >= windowStart && departs < windowEnd
  })

  // Deduplicate transport segments by id (linked + unlinked fallback).
  const segMap = new Map<string, DaySegment>()
  for (const s of [...linkedOnThisDay, ...(datedSegments ?? [])]) segMap.set(s.id, s)

  // One entry per card. A same-day check-in and check-out is excluded from the
  // check-out query above, so a stay cannot produce two cards for one event.
  const hotels: DayHotelItem[] = [
    ...(checkinHotels ?? []).map((h) => ({ ...h, isCheckout: false })),
    ...(checkoutHotels ?? []).map((h) => ({ ...h, isCheckout: true })),
  ]

  const shows: DayShow[] = (showRows ?? []).map((s) => ({
    id: s.id,
    venue_name: s.venue_name,
    address: s.address,
    capacity: s.capacity,
    venue_type: s.venue_type,
    day_sheets: flattenDaySheet(s.day_sheets),
  }))

  // The tail is not folded into segmentIds or hotelStayIds. Those drive the day
  // roster, which answers "who is on this day", and these people are on the next
  // one. Showing a TM that a red-eye exists is useful; counting its passengers
  // as today's party is not.
  const lateNight: LateNight = {
    segments: lateSegmentRows ?? [],
    events: lateEventRows ?? [],
  }

  return {
    shows,
    segments: Array.from(segMap.values()),
    hotels,
    events: eventRows ?? [],
    lateNight,
    segmentIds: Array.from(segMap.keys()),
    // Deduplicated: a stay checking in and out across this day would otherwise
    // contribute its occupants to the roster twice.
    hotelStayIds: Array.from(new Set(hotels.map((h) => h.id))),
  }
}
