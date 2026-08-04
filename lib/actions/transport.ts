'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { boardingPassJob } from '@/trigger/jobs/boarding-pass'
import type { TravelOption } from '@/lib/logistics/types'
import type { TablesUpdate } from '@/lib/types/database'
import { bustTourContextCache } from '@/lib/ai/context'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import { localDateInZone } from '@/lib/schedule/datetime'
import type { DateMove } from '@/lib/schedule/date-move'

// `moved` is set only when the segment actually landed on a day other than the
// one the TM was looking at. See lib/schedule/date-move.ts.
export type TransportActionState = {
  error: string | null
  segmentId?: string
  moved?: DateMove | null
}

// Records a planner option as a transport_segment with status='planned'.
// Never sets status='booked'. The TM promotes to booked after booking
// off-platform and pasting the reference into the segment detail view.
export async function recordTransportOption(
  tourId: string,
  showId: string,
  personId: string,
  option: TravelOption
): Promise<TransportActionState> {
  const user = await requireUser()

  const supabase = await createClient()

  // RLS scopes rows by tour, but it does not check that two ids arriving in
  // the same payload belong to the same tour. Without these checks a personId
  // from another account's tour attached cleanly to a segment on this one, and
  // boardingPassJob then sent that person real travel details to a real phone
  // number. Verify every id against tourId before writing anything.
  // sendRider in lib/actions/documents.ts is the reference shape.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  const { data: show } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .single()

  if (!show) {
    return { error: 'Show not found on this tour.' }
  }

  const { data: person } = await supabase
    .from('people')
    .select('id')
    .eq('id', personId)
    .eq('tour_id', tourId)
    .single()

  if (!person) {
    return { error: 'Person not found on this tour.' }
  }

  // Derive source_provider from the raw payload if it carries a recognisable key.
  // Adapters are expected to tag raw with { provider: 'duffel' | 'trainline' | ... }.
  const rawObj = option.raw as Record<string, unknown> | null
  const sourceProvider =
    typeof rawObj?.provider === 'string' ? rawObj.provider : null

  const { data: segment, error: segmentError } = await supabase
    .from('transport_segments')
    .insert({
      tour_id: tourId,
      mode: option.mode,
      origin: option.leg_ref
        ? `${option.leg_ref.slice(0, 3)} (hub)` // best-effort; adapters can enrich
        : null,
      destination: null,
      depart_at: option.depart_at,
      arrive_at: option.arrive_at,
      carrier_operator: option.carrier,
      vehicle_or_flight_no: option.leg_ref,
      status: 'planned',
      source_provider: sourceProvider,
      door_to_site_at: option.door_to_site_at,
      book_url: option.book_url,
      // show_id is stored here so the transport overview can group segments by show.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details_json: { raw: option.raw, show_id: showId } as any,
    })
    .select('id')
    .single()

  if (segmentError || !segment) {
    return { error: segmentError?.message ?? 'Failed to record segment.' }
  }

  // Link the segment to the person via transport_assignments.
  const { error: assignError } = await supabase
    .from('transport_assignments')
    .insert({
      tour_id: tourId,
      segment_id: segment.id,
      person_id: personId,
    })

  if (assignError) {
    return { error: assignError.message }
  }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/transport`)

  return { error: null, segmentId: segment.id }
}

// Creates a new transport segment directly (not via the planner).
// Used by the add forms in the schedule day view.
export async function createTransportSegment(
  tourId: string,
  data: {
    tour_date_id?: string | null
    mode: string
    origin?: string | null
    destination?: string | null
    depart_at?: string | null
    arrive_at?: string | null
    carrier_operator?: string | null
    vehicle_or_flight_no?: string | null
    booking_reference?: string | null
    // Brief 31 (AirLabs): populated only for flight segments added through the
    // Add Flight flow, and only when the AirLabs lookup's own date matched the
    // TM's chosen date (see lib/actions/flight-lookup.ts). Left null otherwise
    // so the live tracking job's diff logic has nothing stale to compare against.
    origin_iata?: string | null
    destination_iata?: string | null
    flight_status?: string | null
    gate?: string | null
    terminal?: string | null
    actual_depart_at?: string | null
    actual_arrive_at?: string | null
    last_tracked_at?: string | null
  },
): Promise<TransportActionState> {
  await requireUser()

  const supabase = await createClient()

  // Ownership of the segment itself is covered by RLS: owns_tour(tour_id) on
  // insert. tour_date_id is not, because RLS cannot see that a day row from
  // another tour was passed alongside a tour_id this account does own. An
  // unchecked one attaches the segment to a day in a different tour, so it
  // disappears from the day the TM added it to.
  if (data.tour_date_id) {
    const { data: tourDate } = await supabase
      .from('tour_dates')
      .select('id')
      .eq('id', data.tour_date_id)
      .eq('tour_id', tourId)
      .single()

    if (!tourDate) return { error: 'Day not found on this tour.' }
  }

  // The caller passes the day the TM was looking at, but every add form lets
  // them pick a departure on a different date (the drive, rail and manual
  // flight forms default their datetime-local to the current day and then let
  // it be edited, and the flight search flow has a date step of its own). So
  // the create paths could produce the same mismatch the edit paths did, and
  // the day view is date-guarded now, which would leave the segment on no day
  // at all rather than on the wrong one.
  //
  // Deriving the link from the departure here is what makes create and edit
  // obey one rule. The create/edit split is the whole root cause of Brief 36,
  // so closing it on both sides is the fix, not just repairing the edit half.
  let tourDateId = data.tour_date_id ?? null
  let dayCreated = false
  let landedOn: string | null = null

  if (data.depart_at) {
    const { data: tourRow } = await supabase
      .from('tours')
      .select('timezone')
      .eq('id', tourId)
      .single()

    const localDate = localDateInZone(data.depart_at, tourRow?.timezone ?? 'UTC')
    const resolved = await resolveTourDateId(supabase, tourId, localDate)
    if (resolved.id === null) return { error: resolved.error }
    tourDateId = resolved.id
    dayCreated = resolved.created
    landedOn = localDate
  }

  // Add a flight from the 14th, set the departure to the 15th, save: the panel
  // closes and the timeline in front of the TM is unchanged. Nothing says the
  // segment exists, which reads as the app having dropped it, and the natural
  // response is to add it again.
  //
  // Compared by day id because the date the form was opened from is not passed
  // here, only that day's id, and both ids are on this tour (checked above). A
  // caller with no tour_date_id has no opened day to have moved away from.
  const movedFromOpenedDay =
    !!data.tour_date_id && !!tourDateId && tourDateId !== data.tour_date_id

  const { data: row, error } = await supabase
    .from('transport_segments')
    // tour_date_id after the spread: the derived link wins over the one the
    // form passed.
    .insert({ tour_id: tourId, status: 'planned', ...data, tour_date_id: tourDateId })
    .select('id')
    .single()

  if (error || !row) return { error: error?.message ?? 'Failed to create segment.' }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/schedule`)

  return {
    error: null,
    segmentId: row.id,
    moved:
      movedFromOpenedDay && landedOn
        ? {
            tourId,
            date: landedOn,
            dayCreated,
            // Transport has no day sheet.
            carriedTimes: false,
          }
        : null,
  }
}

// Updates an existing transport segment. Used by the timeline edit panel.
// Only fields the TM should edit directly are accepted; status promotion
// to 'booked' must be done explicitly by the TM, never auto-set.
export async function updateTransportSegment(
  segmentId: string,
  data: {
    origin?: string | null
    destination?: string | null
    depart_at?: string | null
    arrive_at?: string | null
    carrier_operator?: string | null
    vehicle_or_flight_no?: string | null
    booking_reference?: string | null
    status?: string
  },
): Promise<TransportActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS on transport_segments enforces owns_tour(tour_id).
  //
  // tour_dates(date) is embedded rather than queried separately so the day the
  // segment is currently on costs no extra round trip. It is a plain embed being
  // read, not filtered on, so !inner does not apply: tour_date_id is nullable
  // (the planner writes segments without a link) and a null embed is the correct
  // answer for those, not a row that should have been excluded.
  const { data: existing } = await supabase
    .from('transport_segments')
    .select('tour_id, tour_date_id, depart_at, tour_dates(date)')
    .eq('id', segmentId)
    .single()

  if (!existing) return { error: 'Segment not found.' }

  const update: TablesUpdate<'transport_segments'> = { ...data }

  // Bug 1c, and the hardest of the three to notice. The day view returns linked
  // segments by tour_date_id with no date guard at all, so a segment moved to
  // another day did not vanish the way an edited hotel does: it stayed on the
  // old day, showing the new day's time, sorted by a key belonging to a
  // different date. Wrong and plausible is worse than missing.
  //
  // depart_at is a timestamptz, so the day it belongs to is its local date in
  // the tour's timezone, not its UTC date. 22:00Z on the 14th is the 15th in
  // Auckland.
  //
  // undefined means the form never sent it (the booking-reference control sends
  // that field alone) and the link must survive. null means the TM cleared the
  // departure, and a segment with no departure is on no day.
  let dayCreated = false
  let movedTo: string | null = null

  if (data.depart_at !== undefined) {
    if (!data.depart_at) {
      update.tour_date_id = null
    } else {
      const { data: tourRow } = await supabase
        .from('tours')
        .select('timezone')
        .eq('id', existing.tour_id)
        .single()

      const timezone = tourRow?.timezone ?? 'UTC'
      const localDate = localDateInZone(data.depart_at, timezone)
      const resolved = await resolveTourDateId(supabase, existing.tour_id, localDate)
      if (resolved.id === null) return { error: resolved.error }
      update.tour_date_id = resolved.id
      dayCreated = resolved.created

      // Where the segment was, in the same terms. The link is the source of
      // truth for that, and the departure is the fallback for a planner-created
      // segment that has no link yet, so editing one does not report its repair
      // as a move onto the day it was already on.
      //
      // Both dates are tour-local, which matters here more than anywhere: this is
      // the one record type with no database constraint holding the link and the
      // date together, so a UTC comparison would announce a move on any tour not
      // on UTC every time a departure crossed a UTC midnight without changing its
      // local day.
      const previousDate =
        existing.tour_dates?.date ??
        (existing.depart_at ? localDateInZone(existing.depart_at, timezone) : null)

      if (localDate !== previousDate) movedTo = localDate
    }
  }

  const { error } = await supabase
    .from('transport_segments')
    .update(update)
    .eq('id', segmentId)

  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return {
    error: null,
    segmentId,
    // Bug 1c was the hardest of the three to notice because the segment did not
    // vanish: it stayed on the old day showing the new day's time. Now that it
    // correctly leaves, this is the only thing that says so. Clearing the
    // departure takes it off the schedule rather than to another day, so there is
    // nothing to link to.
    moved: movedTo
      ? { tourId: existing.tour_id, date: movedTo, dayCreated, carriedTimes: false }
      : null,
  }
}

// Deletes a transport segment outright. Used by the schedule edit panel's
// delete menu. RLS (owns_tour) is the real authorization gate; the ownership
// select below exists only so a not-found/not-owned segment returns a clean
// error instead of a silent no-op delete.
export async function deleteTransportSegment(segmentId: string): Promise<TransportActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('transport_segments')
    .select('tour_id')
    .eq('id', segmentId)
    .single()

  if (!existing) return { error: 'Segment not found.' }

  const { error } = await supabase.from('transport_segments').delete().eq('id', segmentId)
  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)
  return { error: null }
}

// Called after the TM uploads a boarding pass against a transport_assignment.
// Schedules the boarding pass send job 3 hours before the segment departs.
// If departure is fewer than 3 hours away, triggers immediately.
export async function scheduleBoardingPassSend(assignmentId: string, tourId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify caller owns this tour before using the admin client.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    console.error('[scheduleBoardingPassSend] Tour not found or not owned by caller:', tourId)
    return
  }

  const admin = createAdminClient()

  // Scope the fetch to the verified tour to prevent cross-tenant reads.
  const { data: assignment } = await admin
    .from('transport_assignments')
    .select('id, tour_id, person_id, segment_id, transport_segments(depart_at)')
    .eq('id', assignmentId)
    .eq('tour_id', tourId)
    .single()

  if (!assignment) {
    console.error('[scheduleBoardingPassSend] Assignment not found:', assignmentId)
    return
  }

  const seg = assignment.transport_segments as { depart_at: string | null } | null
  const departAt = seg?.depart_at ? new Date(seg.depart_at) : null

  const payload = {
    tour_id: assignment.tour_id,
    person_id: assignment.person_id,
    assignment_id: assignment.id,
    segment_id: assignment.segment_id,
  }

  if (!departAt) {
    // No departure time: trigger immediately so the TM knows the job is live.
    await boardingPassJob.trigger(payload)
    return
  }

  const sendAt = new Date(departAt.getTime() - 3 * 60 * 60 * 1000)
  const now = new Date()

  if (sendAt <= now) {
    // Fewer than 3 hours to departure: send now.
    await boardingPassJob.trigger(payload)
  } else {
    await boardingPassJob.trigger(payload, { delay: sendAt })
  }
}
