import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'
import {
  addDays,
  daysBetween,
  localDateInZone,
  localTimeInZone,
  wallClockToUtc,
} from '@/lib/schedule/datetime'

// Reading a day's items. Brief 42 step 2.
//
// This is the query that replaces two things: the old day-sheet embed on
// SHOW_SELECT in lib/schedule/day-records.ts, and the separate freeform-events
// fetch beside it. Both become one read of one table, which is the point of the
// brief.
//
// Nothing calls this yet. The timeline and day-records repoint lands with the
// write path in REE-18, because a day view that READS items while edits still
// WRITE columns would save a load-in successfully and never show it. That is the
// silent-failure shape this brief exists to remove, so the two halves ship in one
// merge.

type Client = Awaited<ReturnType<typeof createClient>>

export type DayItem = Pick<
  Tables<'day_items'>,
  | 'id'
  | 'tour_id'
  | 'tour_date_id'
  | 'show_id'
  | 'kind'
  | 'title'
  | 'starts_at'
  | 'ends_at'
  | 'location'
  | 'notes'
>

const DAY_ITEM_SELECT =
  'id, tour_id, tour_date_id, show_id, kind, title, starts_at, ends_at, location, notes'

// A read either succeeded or it did not, and the caller has to be able to tell.
// An empty array on failure is the bug that told a crew member their tour had no
// shows: "nothing here" is a confident, plausible, wrong answer. Every caller
// checks `error` and says it could not load rather than that the day is empty.
export interface DayItemsResult {
  items: DayItem[]
  error: string | null
}

/**
 * Every item on one day of a tour, ordered as the timeline shows them.
 *
 * Ordering is starts_at then created_at, with untimed items first. There is no
 * sort_order column: two items at the same instant are rare and a stable
 * tiebreak is enough, and a manual ordering column becomes a thing every write
 * path has to maintain.
 *
 * Untimed items sort first rather than last, so they read as a to-do rail at the
 * top of the day instead of appearing after the load-out. day_items.starts_at is
 * nullable, so these exist.
 *
 * `tourDateId` null means the date is not a day of the tour, which is a real
 * state (an off-calendar date has no tour_dates row). That is not an error and
 * returns no items without touching the database.
 */
export async function fetchDayItems(
  supabase: Client,
  { tourId, tourDateId }: { tourId: string; tourDateId: string | null },
): Promise<DayItemsResult> {
  if (!tourDateId) return { items: [], error: null }

  const { data, error } = await supabase
    .from('day_items')
    .select(DAY_ITEM_SELECT)
    .eq('tour_id', tourId)
    .eq('tour_date_id', tourDateId)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) {
    // Logged here as well as returned, because on Trigger.dev this log line is
    // the only place the failure is visible: the job has already accepted the
    // message and throwing would lose the reply.
    console.error('[day-items] could not read the day:', error.message)
    return { items: [], error: error.message }
  }

  return { items: data ?? [], error: null }
}

/**
 * One show's items, in running order.
 *
 * For the crew-facing surfaces, which answer for a show rather than for a day:
 * /itinerary, the morning message, the change alert and the planner all start
 * from "which show" and want its times.
 *
 * Scoped by show_id rather than by the day, deliberately. A day can hold items
 * that are not the show's (a hotel checkout typed as a custom item, a press call
 * on a travel day), and a message about a show should not carry them.
 *
 * Same error contract as fetchDayItems: an empty array on failure is the bug
 * that told a crew member their tour had no shows.
 */
export async function fetchShowItems(
  supabase: Client,
  showId: string,
): Promise<DayItemsResult> {
  const { data, error } = await supabase
    .from('day_items')
    .select(DAY_ITEM_SELECT)
    .eq('show_id', showId)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[day-items] could not read the show:', error.message)
    return { items: [], error: error.message }
  }

  return { items: data ?? [], error: null }
}

/**
 * The same, for several shows at once, grouped by show id.
 *
 * Guarded against an empty id list: an empty `.in()` is a full network round
 * trip that can only ever return nothing.
 */
export async function fetchItemsForShows(
  supabase: Client,
  showIds: string[],
): Promise<{ byShow: Map<string, DayItem[]>; error: string | null }> {
  if (showIds.length === 0) return { byShow: new Map(), error: null }

  const { data, error } = await supabase
    .from('day_items')
    .select(DAY_ITEM_SELECT)
    .in('show_id', showIds)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[day-items] could not read the shows:', error.message)
    return { byShow: new Map(), error: error.message }
  }

  const byShow = new Map<string, DayItem[]>()
  for (const item of data ?? []) {
    // show_id is nullable, so an item not attached to a show is skipped rather
    // than grouped under a key of 'null'.
    if (!item.show_id) continue
    const existing = byShow.get(item.show_id)
    if (existing) existing.push(item)
    else byShow.set(item.show_id, [item])
  }

  return { byShow, error: null }
}

/**
 * Moves a show's items to another day, times and all.
 *
 * A show's date is editable, and its running order has to go with it. Before
 * Brief 42 this was shiftDaySheetToDate in lib/actions/shows.ts, moving twenty
 * columns; it is the same job on rows, and it is the same bug class if it is
 * skipped. Brief 19 created that class by adding a day link and updating only
 * the create paths, so editing a date pointed the link at the day the record
 * used to be on. Here it would be worse: the items would keep the old
 * tour_date_id, so the show would move to the 20th and its entire running order
 * would stay on the 14th, visible on a day with no show.
 *
 * Two things move together, and neither is optional. The day link becomes the
 * new day, and each instant is re-derived from the wall clock it reads as in the
 * tour's timezone. Re-derived rather than shifted by a fixed number of hours, so
 * a move across a DST boundary keeps load-in at 10:00 instead of moving it to
 * 09:00.
 *
 * THE DAY OFFSET IS CARRIED, and getting this wrong is silent. A 01:30 curfew is
 * stored on the morning after the show, so moving the show from the 14th to the
 * 20th has to put it on the 21st at 01:30, not the 20th. Re-deriving from the
 * wall clock alone undoes the roll-over, and it takes two actions in sequence
 * before anything looks wrong: move the show, then look at the timeline.
 *
 * Returns whether it carried anything, so a caller can tell a TM "times moved
 * with it" only when times moved. A show whose day is still empty must not be
 * announced as having carried a running order it never had.
 */
export async function shiftDayItemsToDate(
  supabase: Client,
  showId: string,
  oldDate: string,
  newDate: string,
  newTourDateId: string,
  timezone: string | null,
): Promise<boolean> {
  const { data: items, error } = await supabase
    .from('day_items')
    .select('id, starts_at, ends_at')
    .eq('show_id', showId)

  if (error) {
    console.error('[day-items] could not read the items to move:', error.message, { showId })
    return false
  }

  if (!items || items.length === 0) return false

  // No tour timezone set: the instants were written as UTC, so they have to be
  // read back the same way or the move shifts them.
  const zone = timezone ?? 'UTC'

  // Re-derived one at a time rather than in a bulk update, because each row's
  // day offset is its own: a load-in and a curfew on the same show move to
  // different calendar days.
  let moved = false

  for (const item of items) {
    const patch: { tour_date_id: string; starts_at?: string; ends_at?: string } = {
      tour_date_id: newTourDateId,
    }

    for (const field of ['starts_at', 'ends_at'] as const) {
      const stored = item[field]
      // Skipped rather than written, so a null stays null. A whole-row write is
      // what turns "this item has no end" into "this item's end was cleared".
      if (!stored) continue

      const offset = daysBetween(oldDate, localDateInZone(stored, zone))
      patch[field] = wallClockToUtc(
        `${addDays(newDate, offset)}T${localTimeInZone(stored, zone)}`,
        zone,
      )
    }

    const { error: updateError } = await supabase
      .from('day_items')
      .update(patch)
      .eq('id', item.id)

    // Reported rather than thrown. The show itself has already moved, and
    // stopping here would leave some items moved and some not with no way to
    // tell which. Logged because a half-moved running order is a thing a TM
    // needs to know about, and this is the only place it is visible.
    if (updateError) {
      console.error('[day-items] could not move an item with its show:', updateError.message, {
        showId,
        itemId: item.id,
      })
      continue
    }

    moved = true
  }

  return moved
}

/**
 * The first item of a kind, or null.
 *
 * For the surfaces that can only say one thing about a kind: the day header's
 * "Load-in 10:00" chip, the planner's feasibility ranking, the change alert.
 * Items arrive in running order, so first means earliest, which is the one those
 * surfaces want: crew are on site for the first load-in, not the second.
 *
 * A surface that can show a list should render the items instead of calling
 * this. Rows exist so a day can hold two soundchecks; collapsing them back to
 * one is a choice each caller makes deliberately.
 */
export function firstItemOfKind(items: DayItem[], kind: string): DayItem | null {
  return items.find((item) => item.kind === kind) ?? null
}

/**
 * A tour's items across several days, grouped by day.
 *
 * For the morning message and /itinerary, which answer for a range rather than
 * one day. Guarded against an empty id list: an empty `.in()` is a full network
 * round trip that can only ever return nothing.
 */
export async function fetchDayItemsForDays(
  supabase: Client,
  { tourId, tourDateIds }: { tourId: string; tourDateIds: string[] },
): Promise<{ byDay: Map<string, DayItem[]>; error: string | null }> {
  if (tourDateIds.length === 0) return { byDay: new Map(), error: null }

  const { data, error } = await supabase
    .from('day_items')
    .select(DAY_ITEM_SELECT)
    .eq('tour_id', tourId)
    .in('tour_date_id', tourDateIds)
    .order('starts_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[day-items] could not read the days:', error.message)
    return { byDay: new Map(), error: error.message }
  }

  const byDay = new Map<string, DayItem[]>()
  for (const item of data ?? []) {
    const existing = byDay.get(item.tour_date_id)
    if (existing) existing.push(item)
    else byDay.set(item.tour_date_id, [item])
  }

  return { byDay, error: null }
}
