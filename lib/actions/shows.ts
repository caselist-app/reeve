'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { showSchema } from '@/lib/validators/show'
import { bustTourContextCache } from '@/lib/ai/context'
import { daySheetFormSchema } from '@/lib/validators/day-sheet'
import {
  setAdvanceStatus,
  DEPARTMENT_DOC_TYPE,
  DEPARTMENT_LABELS,
  type DocumentedDepartment,
  type DepartmentShareData,
  type ContactablePerson,
  type ShareRow,
} from '@/lib/shows/advance'
import { resolveHubJob } from '@/trigger/jobs/resolve-hub'
import { revertDayTypeIfOrphaned } from '@/lib/schedule/day-type-revert'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import { localTimeInZone, localDateInZone } from '@/lib/schedule/datetime'
import { resolveDayOffsets, addDays, daysBetween } from '@/lib/schedule/day-sheet-times'
import type { DateMove } from '@/lib/schedule/date-move'
import type { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables, TablesUpdate } from '@/lib/types/database'
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
// This list is NOT chronological and must not be read as if it were. The six
// catering fields sit at the end, after load_out, which is why the roll-over
// rule in lib/schedule/day-sheet-times.ts runs over its own two groups rather
// than over this one in order.
const DAY_SHEET_TIME_FIELDS = [
  'lobby_call',
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
  oldDate: string,
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
    const zone = timezone ?? 'UTC'
    const time = localTimeInZone(stored, zone)

    // Carry the day offset the stored time already has, rather than flattening
    // every time onto the new show date. A 01:30 curfew is stored on the
    // morning after the show, so moving the show from the 14th to the 20th has
    // to put it on the 21st at 01:30, not the 20th. Re-deriving from
    // wall-clock alone silently undid the roll-over, and it took two actions in
    // sequence before anything looked wrong: the same shape as every Brief 36
    // bug, edit something and then look somewhere else.
    const offset = daysBetween(oldDate, localDateInZone(stored, zone))
    const date = addDays(newDate, offset)

    patch[field] = timezone
      ? localTimeToUtcIso(date, time, timezone)
      : `${date}T${time}:00.000Z`
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
      //
      // venue_lat and venue_lng go with it. They were left behind, and both
      // planners treat a stored geocode as authoritative rather than
      // re-geocoding, so correcting a venue address left hotel and transport
      // search running against the coordinates of the old one. Nothing about
      // that is visible: the address on screen is the corrected one, the hub
      // re-resolves, and the results are simply for somewhere else. Of the
      // three fields this clears, it is the only one with no symptom.
      ...(addressChanged
        ? {
            hub_resolved_at: null,
            transport_hub_iata: null,
            transport_hub_rail: null,
            hub_ground_minutes: null,
            venue_lat: null,
            venue_lng: null,
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
      existing.date,
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

  // The stored row, read as HH:MM in the tour's timezone, so the roll-over rule
  // sees the whole day sheet rather than just this payload. A partial caller
  // (confirmExtraction sends load_in and curfew alone) would otherwise have no
  // daytime time to anchor against and would fall back on every save.
  const { data: storedSheet } = await supabase
    .from('day_sheets')
    .select('*')
    .eq('show_id', showId)
    .maybeSingle()

  const merged: Record<string, string | null> = {}
  for (const field of DAY_SHEET_TIME_FIELDS) {
    const submitted = parsed.data[field as keyof typeof parsed.data] as string | null | undefined
    if (submitted !== undefined) {
      merged[field] = submitted
      continue
    }
    const stored = storedSheet?.[field as keyof typeof storedSheet] as string | null | undefined
    merged[field] = stored ? localTimeInZone(stored, timezone ?? 'UTC') : null
  }

  // Which of these fall on the morning after the show. See
  // lib/schedule/day-sheet-times.ts: a curfew of 01:30 is a real 01:30 the next
  // day, and it still renders under this show because the timeline reaches
  // day-sheet times through the show rather than through their own date.
  const offsets = resolveDayOffsets(merged)

  const converted: Record<string, string | null> = {}

  // Only write fields the caller actually submitted. `null` means the TM
  // cleared the field and must be written; `undefined` means the form never
  // sent it and the stored value must survive. Collapsing the two is what let
  // show-panel.tsx, which submits the 14 time fields and no catering, null
  // every catering column on the row each time a TM edited load-in from the
  // day view. Any partial caller added later is safe by construction.
  //
  // The roll-over is computed over the merged view but applied only to the
  // submitted fields, so this stays a partial write. A save that does not
  // mention curfew does not rewrite curfew, even if adding a late doors time
  // has just changed which day the curfew belongs on. That is the correct
  // trade: show-panel resubmits the whole sheet on every save, so the normal
  // path self-corrects, and silently rewriting a column the caller never sent
  // is the exact bug Brief 37 closed.
  for (const field of DAY_SHEET_TIME_FIELDS) {
    const val = parsed.data[field as keyof typeof parsed.data] as string | null | undefined
    if (val === undefined) {
      continue
    } else if (!val) {
      converted[field] = null
    } else {
      const date = addDays(show.date, offsets[field] ?? 0)
      converted[field] = timezone
        ? localTimeToUtcIso(date, val, timezone)
        // No tour timezone set: treat as UTC to avoid silent data loss.
        : `${date}T${val}:00.000Z`
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

// updateShowNotes is gone. Notes belong to the day, not the show, and are
// written by updateDayNotes in lib/actions/tour-dates.ts. See Brief 36 Part 4.

export type ShowVenueDetail = {
  show: Tables<'shows'>
  /** Null while the venue's transport hub is still being resolved. */
  hubResolvedAt: string | null
}

// Everything the venue panel needs to edit a show.
//
// Fetched when the panel opens rather than carried on the side-panel
// descriptor, because the alternative is adding a dozen venue columns and
// hub_resolved_at to SHOW_SELECT, which every day view runs whether or not a TM
// ever opens this panel. Same shape as getContact for the contact panel; that
// is the established pattern for a panel needing more than its id.
export async function getShowVenueDetail(
  showId: string,
): Promise<{ data: ShowVenueDetail | null; error: string | null }> {
  await requireUser()

  // RLS on shows scopes by owns_tour, so a show on someone else's tour reads
  // as not found rather than needing an ownership query of its own.
  const supabase = await createClient()

  const { data: show, error } = await supabase
    .from('shows')
    .select('*')
    .eq('id', showId)
    .maybeSingle()

  if (error) return { data: null, error: error.message }
  if (!show) return { data: null, error: 'Show not found.' }

  return { data: { show, hubResolvedAt: show.hub_resolved_at }, error: null }
}

export type ShowAdvanceDetail = {
  advance: Tables<'show_advance'> | null
  departments: DepartmentShareData[]
  people: ContactablePerson[]
}

// Everything the advance panel needs: the per-department statuses, the riders
// for each department with what has been sent and read, and who can be sent to.
//
// Four queries, so it runs when the panel opens rather than on every day view.
// Same reasoning and same shape as getShowVenueDetail above.
export async function getShowAdvance(
  tourId: string,
  showId: string,
): Promise<{ data: ShowAdvanceDetail | null; error: string | null }> {
  await requireUser()

  const supabase = await createClient()

  // RLS scopes rows by tour but does not check that two ids in one payload
  // belong to the same tour. A show the caller owns on another tour would pass
  // every read below and quietly mix two tours' documents.
  const { data: show } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .maybeSingle()

  if (!show) return { data: null, error: 'Show not found on this tour.' }

  const [
    { data: advance, error: advanceError },
    { data: documents, error: documentsError },
    { data: shares, error: sharesError },
    { data: people, error: peopleError },
  ] = await Promise.all([
    supabase.from('show_advance').select('*').eq('show_id', showId).maybeSingle(),

    // Every current document for the tour, not just the four rider types. The
    // per-department mapping below already filters by doc_type, so an .in()
    // here would be a second copy of "which documents belong to a department"
    // that only ever narrowed the fetch. A tour's current documents are a
    // handful of rows.
    supabase
      .from('documents')
      .select('id, title, doc_type')
      .eq('tour_id', tourId)
      .eq('is_current', true),

    supabase
      .from('document_shares')
      .select('id, document_id, sent_at, opened_at, acknowledged_at, documents(title, doc_type), people(contacts(name))')
      .eq('show_id', showId)
      .order('created_at', { ascending: true }),

    // contacts!inner, and the filter on the embedded column, not on people.
    // This used to read `.not('contact_email', 'is', null)` against people,
    // which has no such column, so PostgREST rejected it and the recipient
    // list came back empty on every render. Nothing surfaced the error, so
    // "Send to venue" has never had anyone to send to.
    supabase
      .from('people')
      .select('id, contacts!inner(name, contact_email)')
      .eq('tour_id', tourId)
      .not('contacts.contact_email', 'is', null),
  ])

  // A failed read must not render as an empty result. An empty document list
  // reads as "this tour has no riders" and an empty recipient list reads as
  // "nobody to send to", and both are confident, plausible and wrong.
  const failure = advanceError ?? documentsError ?? sharesError ?? peopleError
  if (failure) {
    console.error('[getShowAdvance] read failed:', failure.message)
    return { data: null, error: 'Could not load the advance for this show.' }
  }

  const shareRows: ShareRow[] = (shares ?? []).map((s) => {
    const doc = s.documents as { title: string; doc_type: string } | null
    const person = (s.people as { contacts: { name: string } | null } | null)?.contacts ?? null
    return {
      id: s.id,
      document_id: s.document_id,
      document_title: doc?.title ?? '',
      doc_type: doc?.doc_type ?? '',
      recipient_name: person?.name ?? 'Unknown',
      sent_at: s.sent_at,
      opened_at: s.opened_at,
      acknowledged_at: s.acknowledged_at,
    }
  })

  const departments: DepartmentShareData[] = Object.entries(DEPARTMENT_DOC_TYPE).map(
    ([department, docType]) => ({
      department: department as DocumentedDepartment,
      label: DEPARTMENT_LABELS[department as DocumentedDepartment],
      docType,
      documents: (documents ?? []).filter((d) => d.doc_type === docType),
      shares: shareRows.filter((s) => s.doc_type === docType),
    }),
  )

  const contactablePeople = (people ?? [])
    .map((p) => {
      const c = p.contacts as { name: string; contact_email: string | null } | null
      return { id: p.id, name: c?.name ?? '', contact_email: c?.contact_email ?? null }
    })
    .filter((p): p is ContactablePerson => !!p.contact_email)

  return {
    data: { advance: advance ?? null, departments, people: contactablePeople },
    error: null,
  }
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
