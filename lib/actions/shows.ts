'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { showSchema } from '@/lib/validators/show'
import { bustTourContextCache } from '@/lib/ai/context'
import { daySheetFormSchema } from '@/lib/validators/day-sheet'
import { setAdvanceStatus } from '@/lib/shows/advance'
import { resolveHubJob } from '@/trigger/jobs/resolve-hub'
import { revertDayTypeIfOrphaned } from '@/lib/schedule/day-type-revert'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import { localTimeInZone } from '@/lib/schedule/datetime'
import type { DateMove } from '@/lib/schedule/date-move'
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/types/database'
import type { Department, AdvanceStatus } from '@/lib/shows/advance'

// `moved` is set only when the show's date actually changed, which is what makes
// it safe for useEntityForm to announce unconditionally: this action is called
// constantly for edits that move nothing. See lib/schedule/date-move.ts.
export type ShowActionState = { error: string | null; showId?: string; moved?: DateMove | null }

// Every day_sheets column that stores a time derived from the show's date.
// Shared by updateDaySheet (which writes them) and shiftDaySheetToDate (which
// re-derives them when the show moves), so a column added to one is not
// silently missing from the other.
//
// lobby_call_at is deliberately absent: nothing writes it, so it is always
// null. Brief 36 Part 3 drops it and renames hotel_departure to lobby_call.
const DAY_SHEET_TIME_FIELDS = [
  'venue_access',
  'load_in',
  'line_check',
  'soundcheck',
  'vip',
  'doors',
  'support_on',
  'support_off',
  'changeover',
  'headliner_on',
  'headliner_off',
  'curfew',
  'load_out',
  'hotel_departure',
  'catering_breakfast_start',
  'catering_breakfast_end',
  'catering_lunch_start',
  'catering_lunch_end',
  'catering_dinner_start',
  'catering_dinner_end',
] as const

// Converts a HH:MM time string plus a date and IANA timezone into a UTC ISO string.
// All three inserts happen in the IANA timezone; day-sheet times are stored as
// proper timestamptz so they survive DST changes and cross-timezone comparisons.
// Falls back to treating the time as UTC if no timezone is provided.
function localTimeToUtcIso(date: string, time: string, tz: string): string {
  // Treat the date+time as UTC first to create a reference point.
  const ref = new Date(`${date}T${time}:00.000Z`)
  // Find how the target timezone reads at that UTC instant (sv-SE gives "YYYY-MM-DD HH:MM:SS").
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz })
  const [localDate, localTime] = localStr.split(' ')
  // Reconstruct a UTC date from that local representation.
  const localAsUtc = new Date(`${localDate}T${localTime}.000Z`)
  // The offset is the gap between what we put in and what the tz displays.
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

// Day-sheet times are timestamptz derived from the show's own date, so moving a
// show without moving them leaves the timeline rendering the new day with the
// old day's load-in, and /itinerary telling crew the same. Re-derives each
// populated time against the new date from the wall-clock time it reads as in
// the tour's timezone, rather than adding 24 hours, so a move across a DST
// boundary keeps load-in at 10:00 instead of shifting it to 09:00.
//
// Untouched columns stay untouched: a null time is skipped rather than written,
// so this cannot null a field the way a whole-row write would.
//
// Returns whether it actually carried anything, so the move can tell the TM
// "times moved with it" only when times moved. A show whose day sheet is still
// empty (which is every show the moment it is created) must not be announced as
// having carried times it never had.
async function shiftDaySheetToDate(
  supabase: SupabaseClient<Database>,
  showId: string,
  newDate: string,
  timezone: string | null,
): Promise<boolean> {
  const { data: sheet } = await supabase
    .from('day_sheets')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle()

  if (!sheet) return false

  const patch: Record<string, string> = {}

  for (const field of DAY_SHEET_TIME_FIELDS) {
    const stored = sheet[field]
    if (!stored) continue

    // No tour timezone set: the times were written as UTC by updateDaySheet, so
    // they have to be read back the same way or the shift moves them.
    const time = localTimeInZone(stored, timezone ?? 'UTC')
    patch[field] = timezone
      ? localTimeToUtcIso(newDate, time, timezone)
      : `${newDate}T${time}:00.000Z`
  }

  if (Object.keys(patch).length === 0) return false

  const { error } = await supabase
    .from('day_sheets')
    .update(patch as TablesUpdate<'day_sheets'>)
    .eq('show_id', showId)

  // Reported as not carried if the write failed, so the TM is never told times
  // moved when they did not. The move itself still happened and is still worth
  // announcing, which is why this does not fail the action.
  return !error
}

export async function createShow(
  tourId: string,
  data: z.infer<typeof showSchema>
): Promise<ShowActionState> {
  const user = await requireUser()

  const parsed = showSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // Explicit ownership check before hitting the RPC. The RPC also checks via
  // owns_tour(), but this surfaces a clear error message rather than a DB exception.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  const { data: showId, error } = await supabase.rpc('create_show_with_dependents', {
    p_tour_id: tourId,
    p_show_data: parsed.data,
  })

  if (error) {
    return { error: error.message }
  }

  // Enqueue hub resolution asynchronously. The show is saved and returned
  // immediately. The job writes transport_hub_iata, transport_hub_rail,
  // hub_ground_minutes, and hub_resolved_at once it completes.
  await resolveHubJob.trigger({ show_id: showId })

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/shows`)

  return { error: null, showId }
}

export async function updateShow(
  showId: string,
  data: z.infer<typeof showSchema>
): Promise<ShowActionState> {
  await requireUser()

  const parsed = showSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // RLS on shows enforces owns_tour(tour_id). Returns null if caller does not own.
  const { data: existing } = await supabase
    .from('shows')
    .select('address, date, tour_id, tour_date_id')
    .eq('id', showId)
    .single()

  if (!existing) {
    return { error: 'Show not found.' }
  }

  const addressChanged = (parsed.data.address ?? null) !== (existing.address ?? null)
  const dateChanged = parsed.data.date !== existing.date

  // showSchema always carries a date, so this action has always written one.
  // What it never did was move the tour_date_id with it, which is the whole of
  // bug 1a: the schedule queries by the link and stayed on the old day while
  // /itinerary, the morning message and the AI context read the date and moved.
  let nextTourDateId = existing.tour_date_id
  let dayCreated = false

  if (dateChanged) {
    const resolved = await resolveTourDateId(supabase, existing.tour_id, parsed.data.date, {
      dayType: 'show',
    })
    // Compared against null rather than checked for truthiness: an empty string
    // is falsy, so `if (resolved.error)` does not narrow the union and the
    // compiler stops helping on exactly the branch that matters.
    if (resolved.id === null) return { error: resolved.error }
    nextTourDateId = resolved.id
    dayCreated = resolved.created
  }

  const { error } = await supabase
    .from('shows')
    .update({
      ...parsed.data,
      ...(dateChanged ? { tour_date_id: nextTourDateId } : {}),
      // Clear the hub cache whenever the address changes so the planner UI
      // shows "Resolving..." until the job completes.
      ...(addressChanged
        ? {
            hub_resolved_at: null,
            transport_hub_iata: null,
            transport_hub_rail: null,
            hub_ground_minutes: null,
          }
        : {}),
    })
    .eq('id', showId)

  if (error) {
    return { error: error.message }
  }

  let carriedTimes = false

  if (dateChanged) {
    const { data: tourRow } = await supabase
      .from('tours')
      .select('timezone')
      .eq('id', existing.tour_id)
      .single()

    carriedTimes = await shiftDaySheetToDate(
      supabase,
      showId,
      parsed.data.date,
      tourRow?.timezone ?? null,
    )

    // After the show row has moved, not before, or the old day still has a show
    // on it and the revert correctly declines to fire.
    await revertDayTypeIfOrphaned(supabase, existing.tour_date_id, 'show')
  }

  if (addressChanged) {
    await resolveHubJob.trigger({ show_id: showId })
  }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/shows`)
  // The show, its day-sheet times and the day it sits on all render on the
  // schedule, and the Dates sidebar is a layout that no client navigation can
  // re-resolve, so a date change has to be revalidated server-side or the old
  // day keeps the show and the new day never gains it.
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return {
    error: null,
    showId,
    // Null unless the date changed. The show now correctly renders on a day the
    // TM is not looking at, and moving it also carried the day-sheet times and
    // possibly extended the tour's day list, none of which is visible from where
    // they are standing.
    moved: dateChanged
      ? {
          tourId: existing.tour_id,
          date: parsed.data.date,
          dayCreated,
          carriedTimes,
        }
      : null,
  }
}

export async function deleteShow(showId: string): Promise<ShowActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS check: returns null if caller does not own the show's tour.
  const { data: show } = await supabase
    .from('shows')
    .select('id, tour_id, tour_date_id')
    .eq('id', showId)
    .single()

  if (!show) {
    return { error: 'Show not found.' }
  }

  // show_advance and day_sheets cascade-delete from show_id.
  const { error } = await supabase.from('shows').delete().eq('id', showId)

  if (error) {
    return { error: error.message }
  }

  // The show's tour_date was upserted to day_type = 'show' when it was
  // created (create_show_with_dependents RPC). Without this, the day would
  // stay stuck labelled "Show day" with no show behind it.
  if (show.tour_date_id) {
    await revertDayTypeIfOrphaned(supabase, show.tour_date_id, 'show')
  }

  void bustTourContextCache(show.tour_id)
  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

export async function updateDaySheet(
  showId: string,
  data: z.infer<typeof daySheetFormSchema>
): Promise<ShowActionState> {
  await requireUser()

  const parsed = daySheetFormSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  // Fetch show date and tour timezone in two queries to avoid join typing issues.
  const { data: show } = await supabase
    .from('shows')
    .select('date, tour_id')
    .eq('id', showId)
    .single()

  if (!show) {
    return { error: 'Show not found.' }
  }

  const { data: tourRow } = await supabase
    .from('tours')
    .select('timezone')
    .eq('id', show.tour_id)
    .single()

  const timezone = tourRow?.timezone ?? null

  const converted: Record<string, string | null> = {}

  // Only write fields the caller actually submitted. `null` means the TM
  // cleared the field and must be written; `undefined` means the form never
  // sent it and the stored value must survive. Collapsing the two is what let
  // show-panel.tsx, which submits the 14 time fields and no catering, null
  // every catering column on the row each time a TM edited load-in from the
  // day view. Any partial caller added later is safe by construction.
  for (const field of DAY_SHEET_TIME_FIELDS) {
    const val = parsed.data[field as keyof typeof parsed.data] as string | null | undefined
    if (val === undefined) {
      continue
    } else if (!val) {
      converted[field] = null
    } else if (timezone) {
      converted[field] = localTimeToUtcIso(show.date, val, timezone)
    } else {
      // No tour timezone set: treat as UTC to avoid silent data loss.
      converted[field] = `${show.date}T${val}:00.000Z`
    }
  }

  // catering_type is a text column, not a timestamptz: stored as-is.
  if (parsed.data.catering_type !== undefined) {
    converted.catering_type = parsed.data.catering_type
  }

  // Nothing submitted: no-op rather than an empty update.
  if (Object.keys(converted).length === 0) {
    return { error: null }
  }

  // Cast required: the Supabase client rejects index-signature types.
  // All keys in converted are valid day_sheets columns.
  const { error } = await supabase
    .from('day_sheets')
    .update(converted as TablesUpdate<'day_sheets'>)
    .eq('show_id', showId)

  if (error) {
    return { error: error.message }
  }

  void bustTourContextCache(show.tour_id)

  // Day-sheet fields render as timeline items in day-timeline.tsx, so the
  // schedule route has to be revalidated or the timeline keeps showing the old
  // load-in, soundcheck, doors and curfew while the panel says "Saved."
  // show-panel.tsx deliberately does not pass refreshOnSuccess: edit panels
  // rely on the action revalidating, add forms refresh client-side.
  revalidatePath(`/tours/${show.tour_id}/schedule`)

  return { error: null }
}

export async function updateShowNotes(
  showId: string,
  notes: string,
): Promise<ShowActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: show } = await supabase
    .from('shows')
    .select('tour_id')
    .eq('id', showId)
    .single()

  if (!show) return { error: 'Show not found.' }

  const { error } = await supabase
    .from('shows')
    .update({ notes })
    .eq('id', showId)

  if (error) return { error: error.message }

  void bustTourContextCache(show.tour_id)
  revalidatePath(`/tours/${show.tour_id}/schedule`)
  return { error: null, showId }
}

export async function updateAdvanceStatus(
  showId: string,
  department: Department,
  status: AdvanceStatus
): Promise<ShowActionState> {
  await requireUser()
  const supabase = await createClient()
  const err = await setAdvanceStatus(showId, department, status, supabase)
  if (err) return { error: err }
  return { error: null }
}
