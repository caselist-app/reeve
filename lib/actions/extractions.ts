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
  const errors: string[] = []

  // Insert shows.
  for (const show of confirmed.shows) {
    if (!show.date || !show.venue_name) continue
    const { error } = await supabase.from('shows').insert({
      tour_id: tourId,
      date: show.date,
      venue_name: show.venue_name,
      address: show.address ?? null,
      load_in_at: show.load_in_at ?? null,
      curfew_at: show.curfew_at ?? null,
    })
    if (error) errors.push(`Show (${show.venue_name}): ${error.message}`)
  }

  // Insert transport segments.
  for (const seg of confirmed.transport_segments) {
    if (!seg.mode) continue
    const { error } = await supabase.from('transport_segments').insert({
      tour_id: tourId,
      mode: seg.mode,
      origin: seg.origin ?? null,
      destination: seg.destination ?? null,
      depart_at: seg.depart_at ?? null,
      arrive_at: seg.arrive_at ?? null,
      carrier_operator: seg.carrier_operator ?? null,
      vehicle_or_flight_no: seg.vehicle_or_flight_no ?? null,
      booking_reference: seg.booking_reference ?? null,
      status: 'booked',   // TM has confirmed a real document, so treat as booked.
    })
    if (error) errors.push(`Segment (${seg.vehicle_or_flight_no ?? seg.mode}): ${error.message}`)
  }

  // Insert hotel stays.
  for (const hotel of confirmed.hotel_stays) {
    if (!hotel.name && !hotel.city) continue
    const { error } = await supabase.from('hotel_stays').insert({
      tour_id: tourId,
      name: hotel.name ?? null,
      city: hotel.city ?? null,
      address: hotel.address ?? null,
      check_in_date: hotel.check_in_date ?? null,
      check_out_date: hotel.check_out_date ?? null,
      check_in_time: hotel.check_in_time ?? null,
      check_out_time: hotel.check_out_time ?? null,
      confirmation_number: hotel.confirmation_number ?? null,
      status: 'booked',   // TM has confirmed a real document.
    })
    if (error) errors.push(`Hotel (${hotel.name ?? hotel.city}): ${error.message}`)
  }

  if (errors.length > 0) {
    return { error: errors.join(' | ') }
  }

  // Advance the status only after all rows are inserted successfully.
  await supabase
    .from('forwarded_emails')
    .update({ extraction_status: 'confirmed' })
    .eq('id', forwardedEmailId)

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
