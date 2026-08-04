'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import type { HotelOption } from '@/lib/logistics/types'
import type { TablesUpdate } from '@/lib/types/database'
import { bustTourContextCache } from '@/lib/ai/context'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import type { DateMove } from '@/lib/schedule/date-move'

// `moved` is set only when the stay actually landed on a day other than the one
// the TM was looking at. See lib/schedule/date-move.ts.
export type HotelActionState = { error: string | null; stayId?: string; moved?: DateMove | null }

// Records a hotel option as a hotel_stay with status='planned' and creates
// room_assignments for each named person.
// Never sets status='booked'. The TM promotes to booked after booking
// off-platform and entering the confirmation number.
export async function recordHotelOption(
  tourId: string,
  showId: string,
  option: HotelOption,
  party: { crew_people: string[]; artist_people: string[] }
): Promise<HotelActionState> {
  const user = await requireUser()

  const supabase = await createClient()

  // RLS scopes rows by tour, not ids within one payload. Every id here has to
  // be checked against tourId or a person from another account's tour lands in
  // room_assignments and is sent this hotel's details. Same fix as
  // recordTransportOption; sendRider in lib/actions/documents.ts is the shape.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  // Scoped by tour_id as well as id: check_in_date is derived from this row,
  // so an unscoped read here dated the stay off another tour's show.
  const { data: show } = await supabase
    .from('shows')
    .select('date')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .single()

  if (!show) return { error: 'Show not found on this tour.' }

  const partyIds = [...party.artist_people, ...party.crew_people]

  if (partyIds.length > 0) {
    const { data: validPeople } = await supabase
      .from('people')
      .select('id')
      .eq('tour_id', tourId)
      .in('id', partyIds)

    // Compare against the distinct count: a repeated id must not pass by
    // matching a shorter result set.
    if ((validPeople?.length ?? 0) !== new Set(partyIds).size) {
      return { error: 'One or more people are not on this tour.' }
    }
  }

  const { data: stay, error: stayError } = await supabase
    .from('hotel_stays')
    .insert({
      tour_id: tourId,
      name: option.property,
      address: option.address,
      check_in_date: show.date,
      status: 'planned',
      room_block_size: party.crew_people.length + party.artist_people.length,
      parking_json: { ok: option.parking_ok },
      // show_id stored here so the hotels overview can group stays by show.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room_types_json: { raw: option.raw, show_id: showId } as any,
    })
    .select('id')
    .single()

  if (stayError || !stay) {
    return { error: stayError?.message ?? 'Failed to record hotel stay.' }
  }

  // Insert room_assignments for each person in the party.
  const assignments = [
    ...party.artist_people.map((person_id) => ({
      tour_id: tourId,
      hotel_stay_id: stay.id,
      person_id,
      room_tier: 'artist' as const,
    })),
    ...party.crew_people.map((person_id) => ({
      tour_id: tourId,
      hotel_stay_id: stay.id,
      person_id,
      room_tier: 'crew' as const,
    })),
  ]

  if (assignments.length > 0) {
    const { error: assignError } = await supabase
      .from('room_assignments')
      .insert(assignments)

    if (assignError) {
      return { error: assignError.message }
    }
  }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/hotels`)

  return { error: null, stayId: stay.id }
}

// Creates a new hotel stay directly (not via the planner).
// Used by the add hotel form in the schedule day view.
export async function createHotelStay(
  tourId: string,
  data: {
    tour_date_id?: string | null
    name?: string | null
    address?: string | null
    check_in_date?: string | null
    check_in_time?: string | null
    check_out_date?: string | null
    check_out_time?: string | null
    people?: string[]   // person ids for room_assignments
  },
): Promise<HotelActionState> {
  const user = await requireUser()

  const supabase = await createClient()

  const { people = [], ...stayData } = data

  // Same cross-tour check as recordHotelOption. tour_date_id is verified too:
  // an unchecked one attaches the stay to a day row in a different tour, so it
  // vanishes from the day it was added to.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { error: 'Tour not found.' }

  if (stayData.tour_date_id) {
    const { data: tourDate } = await supabase
      .from('tour_dates')
      .select('id')
      .eq('id', stayData.tour_date_id)
      .eq('tour_id', tourId)
      .single()

    if (!tourDate) return { error: 'Day not found on this tour.' }
  }

  if (people.length > 0) {
    const { data: validPeople } = await supabase
      .from('people')
      .select('id')
      .eq('tour_id', tourId)
      .in('id', people)

    if ((validPeople?.length ?? 0) !== new Set(people).size) {
      return { error: 'One or more people are not on this tour.' }
    }
  }

  // Same rule as updateHotelStay, for the same reason. The Add Hotel form
  // defaults its check-in date to the day the TM is on but lets them change it,
  // so passing the caller's tour_date_id straight through would create a stay
  // whose link and check-in date disagree from the moment it exists. Once the
  // composite key lands that is a foreign key violation the TM sees, and before
  // it lands the stay renders on no day. Deriving the link closes the
  // create/edit split that caused all of Brief 36 rather than patching one side.
  let tourDateId = stayData.tour_date_id ?? null
  let dayCreated = false

  if (stayData.check_in_date) {
    const resolved = await resolveTourDateId(supabase, tourId, stayData.check_in_date)
    if (resolved.id === null) return { error: resolved.error }
    tourDateId = resolved.id
    dayCreated = resolved.created
  }

  // The add flow is the worse half of the problem this announces. The panel
  // closes on success and the timeline in front of the TM is unchanged, so a
  // stay created for another date leaves no trace at all and reads as the app
  // having dropped it.
  //
  // Compared by day id rather than by date because the date the form was opened
  // from is not passed to this action, only that day's id. Both ids are on this
  // tour (checked above), so this is a sound comparison, and a caller that passed
  // no tour_date_id (the planner) has no "day the TM was looking at" to have
  // moved away from, which is why a null one announces nothing.
  const movedFromOpenedDay =
    !!stayData.tour_date_id && !!tourDateId && tourDateId !== stayData.tour_date_id

  const { data: stay, error } = await supabase
    .from('hotel_stays')
    // tour_date_id after the spread: the derived link wins over the one the
    // form passed.
    .insert({ tour_id: tourId, status: 'planned', ...stayData, tour_date_id: tourDateId })
    .select('id')
    .single()

  if (error || !stay) return { error: error?.message ?? 'Failed to create hotel stay.' }

  if (people.length > 0) {
    const assignments = people.map((person_id) => ({
      tour_id: tourId,
      hotel_stay_id: stay.id,
      person_id,
      room_tier: 'crew' as const,
    }))
    const { error: assignError } = await supabase.from('room_assignments').insert(assignments)
    if (assignError) return { error: assignError.message }
  }

  void bustTourContextCache(tourId)
  revalidatePath(`/tours/${tourId}/schedule`)

  return {
    error: null,
    stayId: stay.id,
    moved:
      movedFromOpenedDay && stayData.check_in_date
        ? {
            tourId,
            date: stayData.check_in_date,
            dayCreated,
            // Hotels have no day sheet. Stated rather than omitted so a reader of
            // DateMove does not have to work out whether an absent field means
            // false or means unknown.
            carriedTimes: false,
          }
        : null,
  }
}

// Updates an existing hotel stay. Used by the timeline edit panel.
export async function updateHotelStay(
  stayId: string,
  data: {
    name?: string | null
    address?: string | null
    check_in_date?: string | null
    check_in_time?: string | null
    check_out_date?: string | null
    check_out_time?: string | null
    wifi_network?: string | null
    wifi_password?: string | null
  },
): Promise<HotelActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('hotel_stays')
    .select('tour_id, tour_date_id, check_in_date')
    .eq('id', stayId)
    .single()

  if (!existing) return { error: 'Hotel stay not found.' }

  const update: TablesUpdate<'hotel_stays'> = { ...data }

  // Bug 1b: this action wrote the dates and left tour_date_id pointing at the
  // day the stay used to be on. The day view queries linked stays by the link
  // and then only renders one whose check_in_date matches the day, while the
  // unlinked fallback requires tour_date_id to be null, so an edited stay was
  // rejected by the old day and excluded from the new one and rendered on no
  // schedule day at all. It still existed, and still showed on the Hotels page,
  // which made it look like the schedule was broken rather than the data.
  //
  // check_in_date is the day a stay belongs to, so the link derives from it.
  // Recomputed whenever the field is submitted at all, even unchanged, which
  // also repairs planner-created stays (they write check_in_date and no link)
  // the first time a TM edits one.
  //
  // undefined means the form never sent the field and the link must survive.
  // null means the TM cleared the date, and a stay with no check-in date is on
  // no day, so the link goes with it.
  let dayCreated = false

  if (data.check_in_date !== undefined) {
    if (!data.check_in_date) {
      update.tour_date_id = null
    } else {
      const resolved = await resolveTourDateId(supabase, existing.tour_id, data.check_in_date)
      if (resolved.id === null) return { error: resolved.error }
      update.tour_date_id = resolved.id
      dayCreated = resolved.created
    }
  }

  // Compared on the date, not on the link. The link is recomputed whenever the
  // field is submitted at all, even unchanged, so that editing a planner-created
  // stay (which has a check-in date and no link) repairs it. Comparing links
  // would report that repair as a move and tell the TM their hotel went to the
  // day it was already on.
  const dateChanged =
    data.check_in_date !== undefined && data.check_in_date !== existing.check_in_date

  const { error } = await supabase
    .from('hotel_stays')
    .update(update)
    .eq('id', stayId)

  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return {
    error: null,
    stayId,
    // Bug 1b's fix is what makes this necessary: the stay now correctly leaves
    // the day the TM is on. Clearing the date moves it off the schedule entirely
    // rather than to another day, so there is no day to link to and nothing to
    // announce.
    moved:
      dateChanged && data.check_in_date
        ? { tourId: existing.tour_id, date: data.check_in_date, dayCreated, carriedTimes: false }
        : null,
  }
}

// Updates the confirmation number and promotes status to 'booked'.
// This is the only place in the codebase that sets status='booked', 
// and only after the TM has explicitly entered the reference.
export async function confirmHotelBooking(
  stayId: string,
  confirmationNumber: string
): Promise<HotelActionState> {
  await requireUser()

  const supabase = await createClient()

  // Fetch tour_id for cache bust before updating.
  const { data: stay } = await supabase
    .from('hotel_stays')
    .select('tour_id')
    .eq('id', stayId)
    .single()

  const { error } = await supabase
    .from('hotel_stays')
    .update({
      confirmation_number: confirmationNumber,
      status: 'booked',
    })
    .eq('id', stayId)

  if (error) return { error: error.message }

  if (stay) {
    void bustTourContextCache(stay.tour_id)
    revalidatePath(`/tours/${stay.tour_id}/hotels`)
  }

  return { error: null, stayId }
}
