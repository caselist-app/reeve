'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { showSchema } from '@/lib/validators/show'
import { bustTourContextCache } from '@/lib/ai/context'
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
import { shiftDayItemsToDate } from '@/lib/schedule/day-items'
import type { DateMove } from '@/lib/schedule/date-move'
import type { z } from 'zod'
import type { Tables } from '@/lib/types/database'
import type { Department, AdvanceStatus } from '@/lib/shows/advance'

// `moved` is set only when the show's date actually changed, which is what makes
// it safe for useEntityForm to announce unconditionally: this action is called
// constantly for edits that move nothing. See lib/schedule/date-move.ts.
export type ShowActionState = { error: string | null; showId?: string; moved?: DateMove | null }

// DAY_SHEET_TIME_FIELDS, localTimeToUtcIso and shiftDaySheetToDate all went with
// updateDaySheet in Brief 42. A day's times are day_items rows, written by
// lib/actions/day-items.ts, and a show that moves date carries them through
// shiftDayItemsToDate. The old day-sheet table has no writer any more, and
// REE-23 dropped it.

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

  // A new show is a new day in the Dates sidebar (create_show_with_dependents
  // creates the tour_dates row the show hangs off). That sidebar is a layout in
  // the @secondaryPanel slot, so a soft navigation does not re-resolve it: the
  // add-day panel's router.refresh() happens to cover it today, but this is the
  // only add-day path with no server-side revalidate to back that up, unlike
  // createTourDate and createRehearsal. Revalidate so the new day does not sit
  // out of the sidebar until a hard reload. check:conventions Rule 2 does not
  // catch the omission here because the write goes through an RPC, not a
  // .from('shows').insert() it can see. REE-66.
  revalidatePath(`/tours/${tourId}/schedule`)

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

    // Brief 42: the running order is day_items rows, and it moves with the show
    // or it stays behind on a day that no longer has one. Both the day link and
    // each instant move, and each item's day offset is carried, so a 01:30
    // curfew lands on the morning after the NEW date. Selected by the old day
    // (existing.tour_date_id), not the show: most items carry no show_id, and
    // filtering by show_id stranded the hand-added running order. REE-118.
    carriedTimes = await shiftDayItemsToDate(
      supabase,
      existing.tour_date_id,
      existing.date,
      parsed.data.date,
      nextTourDateId,
      tourRow?.timezone ?? null,
    )

    // The day sheet still exists until REE-23 drops it, and nothing writes it any
    // more, so it is deliberately not shifted. Moving a stale copy would keep it
    // looking current right up until the moment someone read it.

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

  // show_advance and day_items cascade-delete from show_id.
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

// updateDaySheet is gone. It wrote twenty columns on a table nothing reads, and
// leaving it callable meant a caller could save a load-in successfully and have
// it appear nowhere. Its partial-write behaviour, its roll-over and its
// revalidate all live in lib/actions/day-items.ts now.

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
