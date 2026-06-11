'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import type { HotelOption } from '@/lib/logistics/types'
import { bustTourContextCache } from '@/lib/ai/context'

export type HotelActionState = { error: string | null; stayId?: string }

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
  await requireUser()

  const supabase = await createClient()

  // Fetch the show to get check-in / check-out dates.
  const { data: show } = await supabase
    .from('shows')
    .select('date')
    .eq('id', showId)
    .single()

  if (!show) return { error: 'Show not found.' }

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
  await requireUser()

  const supabase = await createClient()

  const { people = [], ...stayData } = data

  const { data: stay, error } = await supabase
    .from('hotel_stays')
    .insert({ tour_id: tourId, status: 'planned', ...stayData })
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
  return { error: null, stayId: stay.id }
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
    .select('tour_id')
    .eq('id', stayId)
    .single()

  if (!existing) return { error: 'Hotel stay not found.' }

  const { error } = await supabase
    .from('hotel_stays')
    .update(data)
    .eq('id', stayId)

  if (error) return { error: error.message }

  void bustTourContextCache(existing.tour_id)
  revalidatePath(`/tours/${existing.tour_id}/schedule`)
  return { error: null, stayId }
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
