'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { bustTourContextCache } from '@/lib/ai/context'
import { dayItemSchema, dayItemUpdateSchema } from '@/lib/validators/day-item'
import { dayItemKind } from '@/lib/schedule/day-item-kinds'
import { resolveItemInstants, type DayItemClock } from '@/lib/schedule/day-item-times'
import { localTimeInZone } from '@/lib/schedule/datetime'
import { definedOnly } from '@/lib/forms/write-row'
import type { TablesInsert, TablesUpdate } from '@/lib/types/database'
import type { z } from 'zod'

// The one write path into a day's times. Brief 42, REE-18.
//
// It replaces four: updateDaySheet's twenty columns, createDayEvent,
// updateDayEvent, and the add-event form's own shape. A TM who moves a load-in
// and a TM who adds a press call are now doing the same thing to the same table,
// which is the point of the brief.
//
// Times arrive as HH:MM in the tour's timezone and the instant is built here.
// lib/validators/day-item.ts explains why that boundary is where it is.

export type DayItemActionState = { error: string | null; itemId?: string }

type Client = Awaited<ReturnType<typeof createClient>>

// Sentinel id for an item that does not exist yet. The roll-over rule needs the
// pending item in the day alongside the stored ones, and an insert has no id to
// give it. Not a uuid, deliberately: if this ever reached the database it would
// fail loudly rather than colliding with a real row.
const PENDING_ITEM_ID = 'pending-day-item'

// Every column the day view and comms read back, so a caller never has to guess
// which fields a write left populated.
const DAY_ITEM_COLUMNS = 'id, tour_id, tour_date_id, show_id, kind, title, starts_at, ends_at'

/**
 * The day an item belongs to, and the tour's timezone, verified as the caller's.
 *
 * RLS scopes rows by tour but does not check that two ids in one payload belong
 * to the same tour, and this action takes up to three at once (tour, day, show).
 * A tour_date the caller owns on a different tour would pass RLS on both reads
 * and put the item on the wrong tour's day.
 */
async function resolveDay(
  supabase: Client,
  tourId: string,
  tourDateId: string,
): Promise<{ date: string; timezone: string } | null> {
  const [{ data: tourDate }, { data: tour }] = await Promise.all([
    supabase
      .from('tour_dates')
      .select('date')
      .eq('id', tourDateId)
      .eq('tour_id', tourId)
      .maybeSingle(),
    supabase.from('tours').select('timezone').eq('id', tourId).maybeSingle(),
  ])

  if (!tourDate || !tour) return null

  // Falls back to UTC the way every other date-deriving path in the app does. A
  // tour with no timezone is a tour whose times were written as UTC, so reading
  // them back any other way moves them.
  return { date: tourDate.date, timezone: tour.timezone ?? 'UTC' }
}

async function showIsOnTour(supabase: Client, showId: string, tourId: string): Promise<boolean> {
  const { data } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .maybeSingle()

  return Boolean(data)
}

/**
 * Every item already on this day, as wall clocks in the tour's timezone.
 *
 * The roll-over rule reads the whole day, so a save that mentions one item still
 * has to see the rest. Returns an error rather than an empty array on failure:
 * an empty day has no daytime time to anchor against, so a failed read would
 * silently fall back to 18:00 and store a curfew on the wrong morning.
 */
async function fetchDayClocks(
  supabase: Client,
  tourDateId: string,
  timezone: string,
): Promise<{ clocks: DayItemClock[]; error: string | null }> {
  const { data, error } = await supabase
    .from('day_items')
    .select('id, kind, starts_at, ends_at')
    .eq('tour_date_id', tourDateId)

  if (error) {
    console.error('[day-items] could not read the day before writing:', error.message)
    return { clocks: [], error: 'Could not read this day. Nothing was saved.' }
  }

  const clocks = (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    clock: row.starts_at ? localTimeInZone(row.starts_at, timezone) : null,
    endClock: row.ends_at ? localTimeInZone(row.ends_at, timezone) : null,
  }))

  return { clocks, error: null }
}

/**
 * The cross-field rules the database enforces, stated as sentences a TM can act
 * on.
 *
 * Checked against the merged view rather than the payload, because an update can
 * submit a title without mentioning the kind it already has. The database still
 * has the last word; this exists so the common mistake reads as English instead
 * of as a constraint name.
 */
function checkMergedShape(kind: string, title: string | null): string | null {
  if (kind === 'other' && !title) {
    return 'A custom item needs a name.'
  }
  if (!dayItemKind(kind)) {
    return 'That is not something Reeve knows how to put on a day.'
  }
  return null
}

export async function createDayItem(
  data: z.infer<typeof dayItemSchema>,
): Promise<DayItemActionState> {
  await requireUser()

  const parsed = dayItemSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const input = parsed.data

  const day = await resolveDay(supabase, input.tour_id, input.tour_date_id)
  if (!day) return { error: 'That day is not on this tour.' }

  if (input.show_id && !(await showIsOnTour(supabase, input.show_id, input.tour_id))) {
    return { error: 'Show not found on this tour.' }
  }

  const shapeError = checkMergedShape(input.kind, input.title ?? null)
  if (shapeError) return { error: shapeError }

  const { clocks, error: readError } = await fetchDayClocks(
    supabase,
    input.tour_date_id,
    day.timezone,
  )
  if (readError) return { error: readError }

  const { startsAt, endsAt, error: timeError } = resolveItemInstants(
    [
      ...clocks,
      {
        id: PENDING_ITEM_ID,
        kind: input.kind,
        clock: input.start_clock ?? null,
        endClock: input.end_clock ?? null,
      },
    ],
    PENDING_ITEM_ID,
    day.date,
    day.timezone,
  )
  if (timeError) return { error: timeError }

  const row: TablesInsert<'day_items'> = {
    tour_id: input.tour_id,
    tour_date_id: input.tour_date_id,
    show_id: input.show_id ?? null,
    kind: input.kind,
    title: input.title ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    location: input.location ?? null,
    notes: input.notes ?? null,
  }

  const { data: created, error } = await supabase
    .from('day_items')
    .insert(row)
    .select('id')
    .single()

  if (error || !created) return { error: error?.message ?? 'Could not add this item.' }

  void bustTourContextCache(input.tour_id)

  // The @secondaryPanel Dates list is a layout, so router.push cannot re-resolve
  // it and the timeline is a Server Component either way. day_items is in
  // SCHEDULE_TABLES, so rule 2 fails the build if this line goes.
  revalidatePath(`/tours/${input.tour_id}/schedule`)

  return { error: null, itemId: created.id }
}

export async function updateDayItem(
  itemId: string,
  data: z.infer<typeof dayItemUpdateSchema>,
): Promise<DayItemActionState> {
  await requireUser()

  const parsed = dayItemUpdateSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()
  const input = parsed.data

  // RLS restricts this to items on tours the caller owns, so the row coming back
  // is the ownership check. Its tour_id is then the scope for everything below.
  const { data: existing } = await supabase
    .from('day_items')
    .select(DAY_ITEM_COLUMNS)
    .eq('id', itemId)
    .maybeSingle()

  if (!existing) return { error: 'That item no longer exists.' }

  const day = await resolveDay(supabase, existing.tour_id, existing.tour_date_id)
  if (!day) return { error: 'That day is not on this tour.' }

  // show_id is settable on an update, so it needs the same cross-tour check the
  // create does. Without it an item the caller owns could be repointed at
  // another tour's show, which passes RLS on both reads and corrupts the day
  // grouping. Null is a legitimate value here (detaching an item from its show)
  // and is not a show id to check.
  if (input.show_id && !(await showIsOnTour(supabase, input.show_id, existing.tour_id))) {
    return { error: 'Show not found on this tour.' }
  }

  const mergedKind = input.kind ?? existing.kind
  const mergedTitle = input.title !== undefined ? input.title : existing.title
  const shapeError = checkMergedShape(mergedKind, mergedTitle)
  if (shapeError) return { error: shapeError }

  // Times are only touched when the caller mentioned one. A panel that edits an
  // item's location submits no clock at all, and re-deriving the instant from a
  // stored value would rewrite a time nobody changed, on a day whose anchor may
  // have moved since. Undefined means the form never sent it, so leave it alone.
  const touchesTime = input.start_clock !== undefined || input.end_clock !== undefined

  let times: { starts_at?: string | null; ends_at?: string | null } = {}

  if (touchesTime) {
    const { clocks, error: readError } = await fetchDayClocks(
      supabase,
      existing.tour_date_id,
      day.timezone,
    )
    if (readError) return { error: readError }

    const storedStart = existing.starts_at
      ? localTimeInZone(existing.starts_at, day.timezone)
      : null
    const storedEnd = existing.ends_at ? localTimeInZone(existing.ends_at, day.timezone) : null

    const merged: DayItemClock = {
      id: itemId,
      kind: mergedKind,
      clock: input.start_clock !== undefined ? input.start_clock : storedStart,
      endClock: input.end_clock !== undefined ? input.end_clock : storedEnd,
    }

    const { startsAt, endsAt, error: timeError } = resolveItemInstants(
      // The stored copy of this item is replaced by the merged one rather than
      // sitting alongside it, or the day would hold two versions of the same
      // item and the anchor would read the old time as well as the new.
      [...clocks.filter((c) => c.id !== itemId), merged],
      itemId,
      day.date,
      day.timezone,
    )
    if (timeError) return { error: timeError }

    // Both are written whenever either was touched. They are one window: moving
    // a start past a stored end has to re-derive that end, and clearing a start
    // has to clear the end with it or the row violates end_needs_start.
    times = { starts_at: startsAt, ends_at: endsAt }
  }

  // definedOnly rather than a hand-written spread. Every field the form did not
  // render comes back undefined and is omitted, so the stored value survives;
  // null is serialised and clears the column. Writing `field: value ?? null`
  // here is the bug that destroyed catering on every load-in edit.
  const row = definedOnly<TablesUpdate<'day_items'>>({
    show_id: input.show_id,
    kind: input.kind,
    title: input.title,
    location: input.location,
    notes: input.notes,
    ...times,
  })

  if (Object.keys(row).length === 0) return { error: null, itemId }

  const { error } = await supabase.from('day_items').update(row).eq('id', itemId)

  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null, itemId }
}

export async function deleteDayItem(itemId: string): Promise<DayItemActionState> {
  await requireUser()

  const supabase = await createClient()

  // Read before deleting, for the tour id the revalidate needs. RLS means a row
  // comes back only if the caller owns it, so this is the ownership check too.
  const { data: existing } = await supabase
    .from('day_items')
    .select('tour_id')
    .eq('id', itemId)
    .maybeSingle()

  if (!existing) return { error: 'That item no longer exists.' }

  const { error } = await supabase.from('day_items').delete().eq('id', itemId)

  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null, itemId }
}
