'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import type { ExtractionProposal } from '@/lib/ai/extract'
import { bustTourContextCache } from '@/lib/ai/context'

export type ExtractionActionState = { error: string | null }

// Reads proposed_rows from a forwarded_emails row and inserts the confirmed
// data into the appropriate spine tables. Nothing lands in the spine until
// this function is called with the TM's edited and confirmed values.
// After writing, sets extraction_status = 'confirmed'.
export async function confirmExtraction(
  forwardedEmailId: string,
  confirmed: ExtractionProposal
): Promise<ExtractionActionState> {
  await requireUser()
  const supabase = await createClient()

  // RLS check: owns_tour on forwarded_emails enforces ownership.
  const { data: forwarded } = await supabase
    .from('forwarded_emails')
    .select('id, tour_id, extraction_status')
    .eq('id', forwardedEmailId)
    .single()

  if (!forwarded) return { error: 'Extraction not found.' }
  if (forwarded.extraction_status === 'confirmed') return { error: 'Already confirmed.' }

  const tourId = forwarded.tour_id

  // Optimistic lock: claim the row before inserting any spine data.
  // A concurrent second click will hit the 'Already confirmed.' guard above.
  // On failure below, reset to 'pending' so the TM can retry.
  const { error: lockError } = await supabase
    .from('forwarded_emails')
    .update({ extraction_status: 'confirmed' })
    .eq('id', forwardedEmailId)
    .eq('extraction_status', 'pending')

  if (lockError) return { error: lockError.message }

  const errors: string[] = []

  // Shows: one RPC call per show (they need the tour_dates upsert inside the RPC).
  for (const show of confirmed.shows) {
    if (!show.date || !show.venue_name) continue
    const { error } = await supabase.rpc('create_show_with_dependents', {
      p_tour_id: tourId,
      p_show_data: {
        date: show.date,
        venue_name: show.venue_name,
        address: show.address ?? null,
        load_in_at: show.load_in_at ?? null,
        curfew_at: show.curfew_at ?? null,
      },
    })
    if (error) errors.push(`Show (${show.venue_name}): ${error.message}`)
  }

  // Transport segments: batch insert in a single round trip.
  // status='planned' is correct here: the TM confirmed the booking exists,
  // but 'booked' is set only after they enter a reference number in the UI.
  const segments = confirmed.transport_segments.filter((s) => !!s.mode)
  if (segments.length > 0) {
    const { error } = await supabase.from('transport_segments').insert(
      segments.map((seg) => ({
        tour_id: tourId,
        mode: seg.mode!,
        origin: seg.origin ?? null,
        destination: seg.destination ?? null,
        depart_at: seg.depart_at ?? null,
        arrive_at: seg.arrive_at ?? null,
        carrier_operator: seg.carrier_operator ?? null,
        vehicle_or_flight_no: seg.vehicle_or_flight_no ?? null,
        booking_reference: seg.booking_reference ?? null,
        status: 'planned',
      }))
    )
    if (error) errors.push(`Segments: ${error.message}`)
  }

  // Hotel stays: batch insert in a single round trip.
  const hotels = confirmed.hotel_stays.filter((h) => !!(h.name || h.city))
  if (hotels.length > 0) {
    const { error } = await supabase.from('hotel_stays').insert(
      hotels.map((hotel) => ({
        tour_id: tourId,
        name: hotel.name ?? null,
        city: hotel.city ?? null,
        address: hotel.address ?? null,
        check_in_date: hotel.check_in_date ?? null,
        check_out_date: hotel.check_out_date ?? null,
        check_in_time: hotel.check_in_time ?? null,
        check_out_time: hotel.check_out_time ?? null,
        confirmation_number: hotel.confirmation_number ?? null,
        status: 'planned',
      }))
    )
    if (error) errors.push(`Hotels: ${error.message}`)
  }

  if (errors.length > 0) {
    // Roll back the optimistic lock so the TM can retry.
    await supabase
      .from('forwarded_emails')
      .update({ extraction_status: 'pending' })
      .eq('id', forwardedEmailId)
    return { error: errors.join(' | ') }
  }

  void bustTourContextCache(tourId)

  return { error: null }
}

// Discards an extraction without writing anything to the spine.
// Used when the TM decides the email was not relevant or the extraction is wrong.
export async function discardExtraction(
  forwardedEmailId: string
): Promise<ExtractionActionState> {
  await requireUser()
  const supabase = await createClient()

  const { data: forwarded } = await supabase
    .from('forwarded_emails')
    .select('id, extraction_status')
    .eq('id', forwardedEmailId)
    .single()

  if (!forwarded) return { error: 'Extraction not found.' }

  const { error } = await supabase
    .from('forwarded_emails')
    .update({ extraction_status: 'failed' })
    .eq('id', forwardedEmailId)

  if (error) return { error: error.message }

  return { error: null }
}
