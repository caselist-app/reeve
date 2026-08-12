'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import type { ExtractionProposal } from '@/lib/ai/extract'
import { bustTourContextCache } from '@/lib/ai/context'
import { createDayItem } from '@/lib/actions/day-items'
import { resolveAttentionItem } from '@/lib/actions/inbox'
import { extractionKeepSchema, narrowExtractionProposal, type ExtractionKeep } from '@/lib/validators/extraction'

export type ExtractionActionState = { error: string | null }

const EMPTY_PROPOSAL: ExtractionProposal = { shows: [], transport_segments: [], hotel_stays: [] }

// Reads proposed_rows from a forwarded_emails row and inserts the rows the TM
// kept into the appropriate spine tables. `keep` names indices into
// proposed_rows, not row data: the TM edits nothing in this pass, only keeps
// or discards each proposed row (REE-154), so the server, not the caller, is
// the one source of truth for what a kept row actually contains. Nothing
// lands in the spine until this function is called. After writing, sets
// extraction_status = 'confirmed'.
export async function confirmExtraction(
  forwardedEmailId: string,
  keep: ExtractionKeep
): Promise<ExtractionActionState> {
  await requireUser()
  const supabase = await createClient()

  const parsedKeep = extractionKeepSchema.safeParse(keep)
  if (!parsedKeep.success) return { error: 'That selection is not valid.' }

  // RLS check: owns_tour on forwarded_emails enforces ownership.
  const { data: forwarded } = await supabase
    .from('forwarded_emails')
    .select('id, tour_id, extraction_status, proposed_rows')
    .eq('id', forwardedEmailId)
    .single()

  if (!forwarded) return { error: 'Extraction not found.' }
  if (forwarded.extraction_status === 'confirmed') return { error: 'Already confirmed.' }

  const tourId = forwarded.tour_id
  const proposed = (forwarded.proposed_rows as ExtractionProposal | null) ?? EMPTY_PROPOSAL

  const narrowed = narrowExtractionProposal(proposed, parsedKeep.data)
  if (narrowed.proposal === null) return { error: narrowed.error }

  const confirmed = narrowed.proposal

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
    const { data: showId, error } = await supabase.rpc('create_show_with_dependents', {
      p_tour_id: tourId,
      p_show_data: {
        date: show.date,
        venue_name: show.venue_name,
        address: show.address ?? null,
      },
    })
    if (error) {
      errors.push(`Show (${show.venue_name}): ${error.message}`)
      continue
    }

    // Brief 36 step 3 sent the times the email carried to the day sheet rather
    // than to two show columns the day view could not edit. Brief 42 makes them
    // day_items rows, through the one writer, which is now the same writer the
    // day view uses. Written after the show exists because an item hangs off the
    // day the show is on, and only when there is something to write, so an email
    // with no times adds nothing.
    if (showId && (show.load_in || show.curfew)) {
      // create_show_with_dependents resolves and writes the day link, so the
      // show row is where the day comes from. An item has no date column of its
      // own, deliberately, so this is the only thing that places it.
      const { data: created } = await supabase
        .from('shows')
        .select('tour_date_id')
        .eq('id', showId)
        .maybeSingle()

      if (!created?.tour_date_id) {
        errors.push(`Show times (${show.venue_name}): the show has no day to put them on.`)
        continue
      }

      // One call per time, because a day is rows. Ordered load-in first so the
      // curfew's roll-over has a daytime time to anchor against: a curfew added
      // to an empty day falls back to the 18:00 anchor, which still rolls 01:30
      // correctly but does more work than it needs to.
      for (const [kind, clock] of [
        ['load_in', show.load_in],
        ['curfew', show.curfew],
      ] as const) {
        if (!clock) continue

        const result = await createDayItem({
          tour_id: tourId,
          tour_date_id: created.tour_date_id,
          show_id: showId,
          kind,
          start_clock: clock,
        })
        // Reported rather than thrown: the show landed, and losing the whole
        // extraction because one time did not parse would be the worse trade.
        if (result.error) {
          errors.push(`Show times (${show.venue_name}): ${result.error}`)
        }
      }
    }
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

  // Before the error branch, not after it, because this action is not atomic:
  // shows, segments and stays are written in three separate round trips and a
  // failure on the third leaves the first two in the database. The TM is told
  // to retry, so the rows that did land have to be on screen. Revalidating only
  // on the success path would show them a schedule missing records that exist.
  //
  // The highest data volume of any action in this sweep, and it revalidated
  // nothing at all: a confirmed extraction could add a week of shows, flights
  // and hotels and leave the day view showing none of them.
  revalidatePath(`/tours/${tourId}/schedule`)
  revalidatePath(`/tours/${tourId}/transport`)
  revalidatePath(`/tours/${tourId}/hotels`)

  if (errors.length > 0) {
    // Roll back the optimistic lock so the TM can retry.
    await supabase
      .from('forwarded_emails')
      .update({ extraction_status: 'pending' })
      .eq('id', forwardedEmailId)
    return { error: errors.join(' | ') }
  }

  void bustTourContextCache(tourId)

  // Resolves the Inbox row last, after every spine write above has succeeded:
  // rule 3 of brief 53 is that a producer resolves after its own write
  // succeeds, never before. Anything throwing earlier in this function (or the
  // errors.length branch above returning first) leaves this unreached, so the
  // item stays open and the TM sees the confirm did not fully land.
  await resolveAttentionItem('forwarded_emails', forwardedEmailId)

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

  // Same rule as confirmExtraction: resolve only after the write above has
  // actually landed.
  await resolveAttentionItem('forwarded_emails', forwardedEmailId)

  return { error: null }
}
