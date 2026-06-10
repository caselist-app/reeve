'use server'

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      room_types_json: { raw: option.raw } as any,
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

  return { error: null, stayId: stay.id }
}

// Updates the confirmation number and promotes status to 'booked'.
// This is the only place in the codebase that sets status='booked' —
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

  if (stay) void bustTourContextCache(stay.tour_id)

  return { error: null, stayId }
}
