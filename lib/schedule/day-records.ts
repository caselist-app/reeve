import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'

// Single source of truth for a schedule day's records. The day view used to
// fetch this set two to three times per navigation (the page for panel data,
// the timeline for display, the info panel for the show). It is now fetched
// once here and passed down as props.

type Client = Awaited<ReturnType<typeof createClient>>

export type DayShow = Pick<
  Tables<'shows'>,
  'id' | 'venue_name' | 'address' | 'capacity' | 'venue_type' | 'notes'
> & {
  day_sheets: Pick<
    Tables<'day_sheets'>,
    | 'lobby_call_at' | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
    | 'doors' | 'support_on' | 'support_off' | 'changeover' | 'headliner_on' | 'headliner_off'
    | 'curfew' | 'load_out' | 'hotel_departure'
  > | null
}

export type DaySegment = Pick<
  Tables<'transport_segments'>,
  | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
  | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
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

export interface DayRecords {
  shows: DayShow[]
  segments: DaySegment[]          // deduped union of tour_date-linked and date-matched
  hotelsLinked: DayHotel[]        // attached via tour_date_id
  hotelsCheckin: DayHotel[]       // unlinked, check_in_date matches the day
  hotelsCheckout: DayHotel[]      // unlinked, check_out_date matches the day
  events: DayEvent[]              // excludes the __day_notes__ sentinel
  dayNotes: string | null         // the __day_notes__ sentinel's notes, if any
  // Ids of the tour_date-linked segments and hotels, used by the info panel to
  // resolve the day's roster without re-querying for them.
  linkedSegmentIds: string[]
  linkedHotelIds: string[]
}

const EMPTY: DayRecords = {
  shows: [],
  segments: [],
  hotelsLinked: [],
  hotelsCheckin: [],
  hotelsCheckout: [],
  events: [],
  dayNotes: null,
  linkedSegmentIds: [],
  linkedHotelIds: [],
}

const SHOW_SELECT = `
  id, venue_name, address, capacity, venue_type, notes,
  day_sheets (
    lobby_call_at, venue_access, load_in, line_check, soundcheck, vip,
    doors, support_on, support_off, changeover, headliner_on, headliner_off,
    curfew, load_out, hotel_departure
  )
`

const SEGMENT_SELECT =
  'id, mode, origin, destination, depart_at, arrive_at, carrier_operator, vehicle_or_flight_no, booking_reference, status'

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
  { tourId, tourDateId, date }: { tourId: string; tourDateId: string | null; date: string },
): Promise<DayRecords> {
  // Off-calendar dates have no tour_date row, so the timeline is not rendered.
  // The info panel still needs the day-notes sentinel, so fetch only that.
  if (!tourDateId) {
    const { data } = await supabase
      .from('day_events')
      .select('notes')
      .eq('tour_id', tourId)
      .eq('date', date)
      .eq('title', '__day_notes__')
      .maybeSingle()
    return { ...EMPTY, dayNotes: data?.notes ?? null }
  }

  // Date range for unlinked transport (segments created before tour_date_id was
  // backfilled, or via the planner where show_id was the link instead).
  const nextDate = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)

  const [
    { data: showRows },
    { data: linkedSegments },
    { data: datedSegments },
    { data: linkedHotels },
    { data: checkinHotels },
    { data: checkoutHotels },
    { data: eventRows },
    { data: dayNotesRow },
  ] = await Promise.all([
    supabase.from('shows').select(SHOW_SELECT).eq('tour_id', tourId).eq('tour_date_id', tourDateId),

    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .eq('tour_date_id', tourDateId),

    supabase
      .from('transport_segments')
      .select(SEGMENT_SELECT)
      .eq('tour_id', tourId)
      .is('tour_date_id', null)
      .gte('depart_at', `${date}T00:00:00Z`)
      .lt('depart_at', `${nextDate}T00:00:00Z`),

    supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .eq('tour_date_id', tourDateId),

    supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .is('tour_date_id', null)
      .eq('check_in_date', date),

    supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .is('tour_date_id', null)
      .eq('check_out_date', date)
      .neq('check_in_date', date), // avoid duplicating same-day check-in/out

    supabase
      .from('day_events')
      .select('id, title, starts_at, ends_at, location, notes')
      .eq('tour_id', tourId)
      .eq('date', date)
      .neq('title', '__day_notes__')
      .order('starts_at', { ascending: true }),

    supabase
      .from('day_events')
      .select('notes')
      .eq('tour_id', tourId)
      .eq('date', date)
      .eq('title', '__day_notes__')
      .maybeSingle(),
  ])

  // Deduplicate transport segments by id (linked + unlinked fallback).
  const segMap = new Map<string, DaySegment>()
  for (const s of [...(linkedSegments ?? []), ...(datedSegments ?? [])]) segMap.set(s.id, s)

  const shows: DayShow[] = (showRows ?? []).map((s) => ({
    id: s.id,
    venue_name: s.venue_name,
    address: s.address,
    capacity: s.capacity,
    venue_type: s.venue_type,
    notes: s.notes,
    day_sheets: flattenDaySheet(s.day_sheets),
  }))

  return {
    shows,
    segments: Array.from(segMap.values()),
    hotelsLinked: linkedHotels ?? [],
    hotelsCheckin: checkinHotels ?? [],
    hotelsCheckout: checkoutHotels ?? [],
    events: eventRows ?? [],
    dayNotes: dayNotesRow?.notes ?? null,
    linkedSegmentIds: (linkedSegments ?? []).map((s) => s.id),
    linkedHotelIds: (linkedHotels ?? []).map((h) => h.id),
  }
}
