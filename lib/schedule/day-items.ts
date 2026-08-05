import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'

// Reading a day's items. Brief 42 step 2.
//
// This is the query that replaces two things: the day_sheets embed on
// SHOW_SELECT in lib/schedule/day-records.ts, and the separate day_events fetch
// beside it. Both become one read of one table, which is the point of the brief.
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
 * top of the day instead of appearing after the load-out. day_events.starts_at is
 * already nullable today, so these exist.
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
