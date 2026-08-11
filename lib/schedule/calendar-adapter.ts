// Brief 43 step 2 (REE-53). The pure core of the calendar integration: the map
// from Reeve's three day sources into react-big-calendar's event shape, and back.
//
// THE ONE HARD THING. day_items.ends_at is nullable and stays nullable, but RBC
// requires every event to carry both a start and an end. That mismatch has two
// directions and this file owns both.
//
//   Inbound: a null end must become a drawable block, so the adapter fills in a
//   display-only end and flags it `syntheticEnd`. It is not stored and it is not
//   a claim about the world. The check constraint would reject an equal pair
//   anyway (`ends_at is null or starts_at is null or ends_at > starts_at`,
//   strictly greater), which is why the migration refused to store an invented
//   end: "an invented value cannot be told apart from a stated one once stored".
//
//   Outbound is where the bug lives. A TM drags a block to move it, RBC's
//   onEventDrop hands back { event, start, end }, and the end in that payload is
//   the fake one this adapter supplied. Writing it converts "nobody has said how
//   long this takes" into "someone said it takes half an hour", silently, on an
//   action the TM believes is a move. fromDropOrResize refuses: a move preserves
//   the null, only a resize (which necessarily changes the duration) sets an end.
//
// THE LOAD-BEARING RULE OF BRIEF 43 APPLIES HERE FIRST: nothing in this adapter
// may ask RBC or Luxon which day something is on. It converts instants and
// nothing else. resolveTourDateId() and localDateInZone() derive the day, server
// side, in REE-54. RBC's named-timezone support rests on an unmerged four-year-
// old PR and a prototype patch, so its notion of a day is the least trustworthy
// thing in the stack. The only timezone this file touches is turning a hotel's
// naive wall-clock date+time into the absolute instant it names (via
// wallClockToUtc), which is composing an instant, not deriving a day from one.

import { dayItemKind, type DayItemKind } from '@/lib/schedule/day-item-kinds'
import { wallClockToUtc } from '@/lib/schedule/datetime'

// A display-only block length for an item whose real end is unknown. Chosen for
// visibility on the grid, not as a claim: it is never stored, and fromDropOrResize
// strips it back to null on the way out unless the TM has actually resized. The
// migration's example of the thing NOT to store was "10:00 to 10:15"; this is a
// larger value only so a fresh block is easy to grab, and its exact size does
// not matter because nothing downstream reads it as duration.
export const SYNTHETIC_END_MS = 30 * 60 * 1000

// Which source a stored event came from, so the write path in REE-54 can
// dispatch the persist back to the right table. A discriminated union on this.
export type EventSource = 'day_item' | 'segment' | 'hotel'

// RBC's event shape (title, start, end) plus everything the write path and the
// render need. start and end are real JS Dates because that is what RBC consumes.
export interface CalendarEvent {
  // Unique across sources, so it is safe as an RBC key even when a day_item and a
  // segment share a row id from different tables.
  id: string
  // The underlying row id, for the write path to target its own table.
  recordId: string
  source: EventSource
  title: string
  start: Date
  end: Date
  // True means `end` was invented by this adapter and must not be persisted as a
  // stated end. See fromDropOrResize.
  syntheticEnd: boolean
  // Read from day-item-kinds for a day_item; a source-level default otherwise.
  accent: DayItemKind['accent']
  icon: string
}

// A record with no start instant cannot be placed on a time grid. It is returned
// here rather than dropped, so the day view can still list it (a fresh show after
// Brief 42 has no times at all, so this is the normal state of a new day, not an
// edge case). Producing no event is the point: an invented start would be the
// same class of lie as an invented end.
export interface UnpositionedRecord {
  source: EventSource
  id: string
  title: string
  // The same colour language the grid blocks carry, so the "No time set" rail
  // is not flat grey (REE-82). Read from day-item-kinds for a day_item, a
  // source-level default otherwise, exactly as CalendarEvent above.
  accent: DayItemKind['accent']
  icon: string
}

export interface CalendarInput {
  items: CalendarDayItem[]
  segments: CalendarSegment[]
  hotels: CalendarHotel[]
}

// Only the fields the adapter reads, so a caller (and a test) does not have to
// build a whole row. starts_at / ends_at are UTC instants; a null end is the case
// this file exists to handle.
export interface CalendarDayItem {
  id: string
  kind: string
  title: string | null
  starts_at: string | null
  ends_at: string | null
}

export interface CalendarSegment {
  id: string
  mode: string
  origin: string | null
  destination: string | null
  depart_at: string | null
  arrive_at: string | null
}

// Hotel check-in and check-out are naive local date + time columns, not instants,
// and there is no end column for either: a stay's block on the calendar can never
// carry a stated end. isCheckout picks which pair this event represents, matching
// the per-day split fetchDayRecords already does.
export interface CalendarHotel {
  id: string
  name: string | null
  check_in_date: string | null
  check_in_time: string | null
  check_out_date: string | null
  check_out_time: string | null
  isCheckout: boolean
}

export interface CalendarOptions {
  // IANA name. Used only to turn a hotel's wall-clock date+time into the instant
  // it names. day_items and segments are already stored as instants, so their
  // placement does not depend on it.
  timezone: string
}

export interface CalendarAdapterResult {
  events: CalendarEvent[]
  unpositioned: UnpositionedRecord[]
}

function synthesiseEnd(start: Date): Date {
  return new Date(start.getTime() + SYNTHETIC_END_MS)
}

function dayItemTitle(item: CalendarDayItem): string {
  // The stored title wins; otherwise the kind's label, so a load-in with no title
  // still reads as "Load-in" rather than "load_in". dayItemKind returns undefined
  // for a kind this build does not know, and the raw kind is deliberately ugly
  // then, because that is a bug and should look like one.
  return item.title ?? dayItemKind(item.kind)?.label ?? item.kind
}

function segmentTitle(seg: CalendarSegment): string {
  if (seg.origin && seg.destination) return `${seg.origin} to ${seg.destination}`
  return seg.origin ?? seg.destination ?? seg.mode
}

// Lucide component name per transport mode. day-item-kinds owns icons for day
// items; there is no equivalent list for modes, so this small map is the source
// of truth for the four the schema allows plus a fallback.
function segmentIcon(mode: string): string {
  switch (mode) {
    case 'flight':
      return 'Plane'
    case 'rail':
      return 'TrainFront'
    case 'bus':
    case 'ground':
    case 'hire':
      return 'Bus'
    case 'truck':
      return 'Truck'
    default:
      return 'Navigation'
  }
}

function hotelTitle(hotel: CalendarHotel): string {
  const label = hotel.name ?? 'Hotel'
  return hotel.isCheckout ? `${label} check-out` : `${label} check-in`
}

/**
 * Maps all three day sources into RBC events.
 *
 * A record with no start instant (a day_item with null starts_at, a segment with
 * no depart_at, a hotel missing the relevant date or time) is returned in
 * `unpositioned` and produces no event. Every event carries `source` so the write
 * path can dispatch, and `syntheticEnd` where the end was invented.
 */
export function toCalendarEvents(
  input: CalendarInput,
  opts: CalendarOptions,
): CalendarAdapterResult {
  const events: CalendarEvent[] = []
  const unpositioned: UnpositionedRecord[] = []

  for (const item of input.items) {
    const kind = dayItemKind(item.kind)
    if (!item.starts_at) {
      unpositioned.push({
        source: 'day_item',
        id: item.id,
        title: dayItemTitle(item),
        accent: kind?.accent ?? 'other',
        icon: kind?.icon ?? 'CircleDashed',
      })
      continue
    }
    const start = new Date(item.starts_at)
    const syntheticEnd = !item.ends_at
    const end = syntheticEnd ? synthesiseEnd(start) : new Date(item.ends_at as string)
    events.push({
      id: `day_item:${item.id}`,
      recordId: item.id,
      source: 'day_item',
      title: dayItemTitle(item),
      start,
      end,
      syntheticEnd,
      accent: kind?.accent ?? 'other',
      icon: kind?.icon ?? 'CircleDashed',
    })
  }

  for (const seg of input.segments) {
    if (!seg.depart_at) {
      unpositioned.push({
        source: 'segment',
        id: seg.id,
        title: segmentTitle(seg),
        accent: 'other',
        icon: segmentIcon(seg.mode),
      })
      continue
    }
    const start = new Date(seg.depart_at)
    // A segment's stated end is its arrival. When it has none, synthesise the
    // same as a day item: the write path in REE-54 will not persist it.
    const syntheticEnd = !seg.arrive_at
    const end = syntheticEnd ? synthesiseEnd(start) : new Date(seg.arrive_at as string)
    events.push({
      id: `segment:${seg.id}`,
      recordId: seg.id,
      source: 'segment',
      title: segmentTitle(seg),
      start,
      end,
      syntheticEnd,
      accent: 'other',
      icon: segmentIcon(seg.mode),
    })
  }

  for (const hotel of input.hotels) {
    const date = hotel.isCheckout ? hotel.check_out_date : hotel.check_in_date
    const time = hotel.isCheckout ? hotel.check_out_time : hotel.check_in_time
    if (!date || !time) {
      unpositioned.push({
        source: 'hotel',
        id: hotel.id,
        title: hotelTitle(hotel),
        accent: 'other',
        icon: 'BedDouble',
      })
      continue
    }
    // Compose the instant this wall clock names in the tour zone. This is the one
    // timezone conversion the adapter does, and it is composition (wall clock ->
    // instant), never derivation (instant -> which day). check_*_time is a naive
    // HH:MM(:SS); take HH:MM.
    const start = new Date(wallClockToUtc(`${date}T${time.slice(0, 5)}`, opts.timezone))
    // A stay has no end column for either end, so the block's end is always
    // invented. A check-out in particular can never carry a real end.
    events.push({
      id: `hotel:${hotel.id}`,
      recordId: hotel.id,
      source: 'hotel',
      title: hotelTitle(hotel),
      start,
      end: synthesiseEnd(start),
      syntheticEnd: true,
      accent: 'other',
      icon: 'BedDouble',
    })
  }

  return { events, unpositioned }
}

// RBC hands onEventDrop / onEventResize a payload of the dragged event plus the
// new start and end as Dates. `original` is the event as this adapter produced
// it, which still carries syntheticEnd and the instants before the drag.
export interface DropOrResizePayload {
  event: CalendarEvent
  start: Date
  end: Date
}

// What to persist, discriminated by source so the write path targets the right
// table. endsAt null is the load-bearing case: it means "leave the stored end
// null", not "clear the end". REE-54 maps this to skipping the column, not
// writing null over it.
export interface PersistTarget {
  source: EventSource
  id: string
  startsAt: string
  endsAt: string | null
}

/**
 * Turns a drop or resize back into what to write.
 *
 * Returns endsAt: null whenever the end is still the synthesised one, which a
 * pure move preserves: RBC shifts start and end by the same delta, so the
 * duration is unchanged, so `end` is still `start + SYNTHETIC_END_MS` and no one
 * has stated anything. Only a resize changes the duration, and only then does an
 * end get written. A record whose end was stated (syntheticEnd false) always
 * round-trips its end, move or resize.
 */
export function fromDropOrResize(
  payload: DropOrResizePayload,
  original: CalendarEvent,
): PersistTarget {
  const originalDurationMs = original.end.getTime() - original.start.getTime()
  const newDurationMs = payload.end.getTime() - payload.start.getTime()
  // Still synthetic only if it was synthetic to begin with AND the duration is
  // unchanged. A resize necessarily changes the duration, so it falls through to
  // writing the real end.
  const endStillSynthetic = original.syntheticEnd && newDurationMs === originalDurationMs

  return {
    source: original.source,
    id: original.recordId,
    startsAt: payload.start.toISOString(),
    endsAt: endStillSynthetic ? null : payload.end.toISOString(),
  }
}
