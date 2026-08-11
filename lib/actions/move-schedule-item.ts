'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { bustTourContextCache } from '@/lib/ai/context'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'
import { localBroadcastDateInZone } from '@/lib/schedule/day-window'
import { definedOnly } from '@/lib/forms/write-row'
import { moveScheduleItemSchema, type MoveScheduleItemInput } from '@/lib/validators/move-schedule-item'
import type { TablesUpdate } from '@/lib/types/database'

// The one write path for a drag or resize on the schedule calendar. REE-54,
// Brief 43 step 3, and the highest-risk step in the project.
//
// THE HAZARD IT CONTAINS is silent and has no database constraint behind it. A
// transport_segment whose tour_date_id points at one day but whose depart_at
// falls on another (in the tour's timezone) renders on NEITHER: the old day
// fetches it by the link and filters it out on time, the new day queries by its
// own link and never sees it. transport_segments has no composite foreign key,
// deliberately, so a drag that moves a departure past midnight without also
// writing tour_date_id will look like it worked and lose the record. This action
// writes both, together, every time.
//
// AND THE DAY IT WRITES IS THE BROADCAST DAY, NOT THE CALENDAR DAY (REE-115). The
// grid the drag happens on is one broadcast night [04:00, +1 04:00), so a segment
// dragged from 22:00 to 01:30 is still on tonight. Deriving its day from the
// calendar date instead moved it to tomorrow and it disappeared from the night
// the TM was working on: the same vanish, one midnight later (REE-110). moveSegment
// derives the day with localBroadcastDateInZone so a same-night drag keeps its day
// and only a drop past 04:00 re-homes it.
//
// THE INVERSE, equally load-bearing: a day_item's link and instant are ALLOWED
// to disagree. A 01:30 curfew belongs to the show it ends, so dragging it later
// into the small hours must not repoint its tour_date_id at the next calendar
// day. The day_item path therefore never re-derives the day. Getting both of
// these right is the whole point of the issue.
//
// THE RULE OF BRIEF 43: nothing reaching this action asked RBC or Luxon which
// day something is on. The drag proposes an instant; this action derives the
// day, through resolveTourDateId() and localDateInZone() (calendar day, for the
// hotel path) or localBroadcastDateInZone() (broadcast night, for the segment
// path). That is what makes the library's weak timezone story survivable.

type Client = Awaited<ReturnType<typeof createClient>>

export type MoveScheduleItemState = { error: string | null }

/**
 * Persists a schedule drag or resize.
 *
 * `tourId` is the tour whose schedule the TM is looking at, passed so the row
 * under the move can be checked to belong to it. RLS scopes rows by tour but
 * does not check that an id in the payload is on the tour named alongside it: an
 * item id from a second tour on the same account passes RLS and would otherwise
 * be moved on the wrong tour's calendar. The fetched row's tour_id is compared
 * to `tourId` before anything is written.
 */
export async function moveScheduleItem(
  tourId: string,
  input: MoveScheduleItemInput,
): Promise<MoveScheduleItemState> {
  await requireUser()

  const parsed = moveScheduleItemSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const move = parsed.data

  switch (move.source) {
    case 'day_item':
      return moveDayItem(supabase, tourId, move)
    case 'segment':
      return moveSegment(supabase, tourId, move)
    case 'hotel':
      return moveHotel(supabase, tourId, move)
  }
}

/**
 * The row's tour_id, confirmed to be the tour the caller named.
 *
 * RLS restricts the read to rows on tours the caller owns, so a row coming back
 * is the ownership gate. The equality check is the cross-tour gate on top of it:
 * both tours can belong to one account, so RLS alone would let a move land on a
 * tour the TM was not looking at. Returns null (with the caller reporting the
 * error) when the row is missing or on another tour, so nothing is written in
 * either case.
 */
async function ownedRowTourId(
  supabase: Client,
  table: 'day_items' | 'transport_segments' | 'hotel_stays',
  id: string,
  tourId: string,
): Promise<{ ok: true } | { ok: false }> {
  const { data } = await supabase.from(table).select('tour_id').eq('id', id).maybeSingle()
  if (!data || data.tour_id !== tourId) return { ok: false }
  return { ok: true }
}

async function tourTimezone(supabase: Client, tourId: string): Promise<string> {
  const { data } = await supabase.from('tours').select('timezone').eq('id', tourId).maybeSingle()
  // Falls back to UTC the way every other date-deriving path in the app does. A
  // tour with no timezone is one whose times were written as UTC.
  return data?.timezone ?? 'UTC'
}

async function moveDayItem(
  supabase: Client,
  tourId: string,
  move: Extract<MoveScheduleItemInput, { source: 'day_item' }>,
): Promise<MoveScheduleItemState> {
  const owned = await ownedRowTourId(supabase, 'day_items', move.id, tourId)
  if (!owned.ok) return { error: 'That item no longer exists.' }

  // tour_date_id is DELIBERATELY not touched. A day_item's link and its instant
  // are allowed to disagree, and that is the feature: a curfew dragged from 23:00
  // to 01:30 keeps the show day it ends rather than jumping to the next calendar
  // day. Re-deriving the day here would be the segment path's fix applied to the
  // one record type that must not have it.
  //
  // endsAt null or absent leaves the stored end alone. A move preserves a
  // synthesised (null) end as null, and never writes null over a stated one;
  // only a resize sends a real end. definedOnly drops the undefined, so the
  // column is not written. This inverts the usual null-means-cleared rule, on
  // purpose: see the validator and lib/schedule/calendar-adapter.ts.
  const row = definedOnly<TablesUpdate<'day_items'>>({
    starts_at: move.startsAt,
    ends_at: move.endsAt ?? undefined,
  })

  const { error } = await supabase.from('day_items').update(row).eq('id', move.id)
  if (error) return { error: error.message }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/schedule`)
  return { error: null }
}

async function moveSegment(
  supabase: Client,
  tourId: string,
  move: Extract<MoveScheduleItemInput, { source: 'segment' }>,
): Promise<MoveScheduleItemState> {
  const owned = await ownedRowTourId(supabase, 'transport_segments', move.id, tourId)
  if (!owned.ok) return { error: 'Segment not found.' }

  const timezone = await tourTimezone(supabase, tourId)

  // THE VANISH-CASE FIX, now on the broadcast day rather than the calendar day.
  // The grid the TM drags on is one broadcast night [04:00, +1 04:00), so a
  // block dragged from 22:00 into the small hours is still on tonight even though
  // its instant crossed real midnight. Deriving the day from the calendar date
  // (localDateInZone) re-homed it to the next date, so the 14th filtered it out
  // on time and the 15th never queried for it: the record vanished the moment it
  // crossed midnight (REE-110). localBroadcastDateInZone keeps a same-night drag
  // on its own day and only moves it once the drop crosses the 04:00 boundary.
  // The day this move brings into existence is a travel day; dayType only labels
  // a freshly created row, so moving onto an existing show or off day leaves that
  // day's type alone.
  const broadcastDate = localBroadcastDateInZone(move.startsAt, timezone)
  const resolved = await resolveTourDateId(supabase, tourId, broadcastDate, { dayType: 'travel' })
  if (resolved.id === null) return { error: resolved.error }

  // arrive_at is the segment's stated end. RBC shifts it with the departure on a
  // move, so a stated arrival travels with the flight, and a synthesised one
  // comes back null and is left alone rather than written. Same null-is-skip
  // rule as the day_item path.
  const row = definedOnly<TablesUpdate<'transport_segments'>>({
    depart_at: move.startsAt,
    tour_date_id: resolved.id,
    arrive_at: move.endsAt ?? undefined,
  })

  const { error } = await supabase.from('transport_segments').update(row).eq('id', move.id)
  if (error) return { error: error.message }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/schedule`)
  return { error: null }
}

async function moveHotel(
  supabase: Client,
  tourId: string,
  move: Extract<MoveScheduleItemInput, { source: 'hotel' }>,
): Promise<MoveScheduleItemState> {
  const owned = await ownedRowTourId(supabase, 'hotel_stays', move.id, tourId)
  if (!owned.ok) return { error: 'Hotel stay not found.' }

  const timezone = await tourTimezone(supabase, tourId)

  // check_in_date and check_in_time are naive local columns, not instants, so
  // the dragged instant is split back into the tour-local date and time it
  // names. tour_date_id and check_in_date are a composite foreign key onto
  // tour_dates(id, date): an inconsistent pair raises 23503 rather than failing
  // silently, so they are resolved and written as one.
  //
  // This stays on the CALENDAR day, unlike the broadcast day the segment path
  // now derives (REE-115). The composite key forces check_in_date to equal
  // tour_dates.date, and check_in_date is also the literal date the stay begins,
  // so filing a 00:30 check-in under the previous broadcast night would have to
  // write the wrong calendar date into check_in_date. A hotel's day is its
  // check-in date, full stop; only transport, with a real depart_at instant and
  // no composite key, can be a broadcast night.
  const checkInDate = localDateInZone(move.startsAt, timezone)
  const checkInTime = localTimeInZone(move.startsAt, timezone)

  const resolved = await resolveTourDateId(supabase, tourId, checkInDate)
  if (resolved.id === null) return { error: resolved.error }

  // The check-in is what moves. A stay carries no end column, so endsAt names
  // nothing here and is ignored: the adapter always synthesises a hotel end, and
  // REE-53's event id does not distinguish check-in from check-out, so a move on
  // this source can only coherently be the check-in.
  const { error } = await supabase
    .from('hotel_stays')
    .update({
      check_in_date: checkInDate,
      check_in_time: checkInTime,
      tour_date_id: resolved.id,
    })
    .eq('id', move.id)

  if (error) return { error: error.message }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/schedule`)
  return { error: null }
}
