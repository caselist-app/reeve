'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { boardingPassJob } from '@/trigger/jobs/boarding-pass'
import type { TravelOption } from '@/lib/logistics/types'
import { bustTourContextCache } from '@/lib/ai/context'

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

  return { error: null, segmentId: segment.id }
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
