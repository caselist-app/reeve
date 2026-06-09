'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import type { TravelOption } from '@/lib/logistics/types'

export type TransportActionState = { error: string | null; segmentId?: string }

// Records a planner option as a transport_segment with status='planned'.
// Never sets status='booked'. The TM promotes to booked after booking
// off-platform and pasting the reference into the segment detail view.
export async function recordTransportOption(
  tourId: string,
  showId: string,
  personId: string,
  option: TravelOption
): Promise<TransportActionState> {
  await requireUser()

  const supabase = await createClient()

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details_json: { raw: option.raw } as any,
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

  return { error: null, segmentId: segment.id }
}
