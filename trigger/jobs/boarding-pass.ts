import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { sendWhatsApp } from '@/lib/comms/whatsapp'
import {
  buildLegLabel,
  formatDeparture,
  formatTime,
  renderBoardingPassMessage,
  type BoardingPassData,
} from '@/lib/comms/templates/boarding-pass'

export type BoardingPassPayload = {
  tour_id: string
  person_id: string
  assignment_id: string  // transport_assignments.id — the dedup dimension
  segment_id: string
}

// Sent 3 hours before departure when the TM uploads a boarding pass.
// Dedup dimension: assignment_id. One send ever per assignment.
const SEND_HOURS_BEFORE_DEPARTURE = 3

export const boardingPassJob = task({
  id: 'boarding-pass',
  run: async (payload: BoardingPassPayload) => {
    const key = buildSendKey(
      payload.tour_id,
      payload.person_id,
      'boarding_pass',
      payload.assignment_id
    )

    const safe = await checkAndSet(key, 60 * 60 * 24 * 7) // 7-day TTL
    if (!safe) {
      return { skipped: true, reason: 'already_sent' }
    }

    const admin = createAdminClient()

    const { data: assignment } = await admin
      .from('transport_assignments')
      .select(`
        seat,
        ticket_reference,
        boarding_pass_document_id,
        people ( name, whatsapp_number, sms_number, preferred_channel ),
        transport_segments (
          mode, origin, destination, depart_at, arrive_at,
          carrier_operator, vehicle_or_flight_no, tour_id
        )
      `)
      .eq('id', payload.assignment_id)
      .single()

    if (!assignment) return { skipped: true, reason: 'assignment_not_found' }

    const person = assignment.people as {
      name: string
      whatsapp_number: string | null
      sms_number: string | null
      preferred_channel: string | null
    } | null

    const seg = assignment.transport_segments as {
      mode: string
      origin: string | null
      destination: string | null
      depart_at: string | null
      arrive_at: string | null
      carrier_operator: string | null
      vehicle_or_flight_no: string | null
      tour_id: string
    } | null

    if (!person?.whatsapp_number && !person?.sms_number) {
      return { skipped: true, reason: 'no_contact_number' }
    }

    const to = person.whatsapp_number ?? person.sms_number!

    // Fetch the tour timezone for local time formatting.
    const { data: tour } = await admin
      .from('tours')
      .select('timezone')
      .eq('id', payload.tour_id)
      .single()

    const timezone = tour?.timezone ?? 'UTC'

    // Look for a ground segment assigned to this person departing within 4 hours
    // of the main leg — this is the car/van to the departure hub.
    let groundPickup: string | null = null
    let groundOrigin: string | null = null
    if (seg?.depart_at) {
      const departTime = new Date(seg.depart_at).getTime()
      const windowStart = new Date(departTime - 4 * 60 * 60 * 1000).toISOString()
      const { data: groundAssignment } = await admin
        .from('transport_assignments')
        .select('transport_segments!inner(mode, origin, depart_at)')
        .eq('person_id', payload.person_id)
        .eq('tour_id', payload.tour_id)
        .neq('id', payload.assignment_id)
        .gte('transport_segments.depart_at', windowStart)
        .lte('transport_segments.depart_at', seg.depart_at)
        .eq('transport_segments.mode', 'ground')
        .limit(1)
        .maybeSingle()

      if (groundAssignment) {
        const groundSeg = groundAssignment.transport_segments as {
          mode: string
          origin: string | null
          depart_at: string | null
        } | null
        if (groundSeg?.depart_at) {
          groundPickup = formatTime(groundSeg.depart_at, timezone)
          groundOrigin = groundSeg.origin
        }
      }
    }

    // Find the destination show's load-in time.
    // Matches shows where arrive_at falls on the show date.
    let loadIn: string | null = null
    let destinationVenue: string | null = null
    if (seg?.arrive_at) {
      const arriveDate = new Intl.DateTimeFormat('en-CA', { timeZone: timezone })
        .format(new Date(seg.arrive_at))
      const { data: destShow } = await admin
        .from('shows')
        .select('venue_name, day_sheets(load_in)')
        .eq('tour_id', payload.tour_id)
        .eq('date', arriveDate)
        .maybeSingle()

      if (destShow) {
        destinationVenue = destShow.venue_name
        const daySheet = destShow.day_sheets as { load_in: string | null } | null
        if (daySheet?.load_in) {
          loadIn = formatTime(daySheet.load_in, timezone)
        }
      }
    }

    const bpData: BoardingPassData = {
      person_first_name: person.name.split(' ')[0],
      leg_label: buildLegLabel(seg?.mode ?? '', seg?.carrier_operator ?? null, seg?.vehicle_or_flight_no ?? null),
      origin: seg?.origin ?? null,
      destination: seg?.destination ?? null,
      depart_formatted: seg?.depart_at ? formatDeparture(seg.depart_at, timezone) : 'TBC',
      seat: assignment.seat ?? null,
      ticket_reference: assignment.ticket_reference ?? null,
      ground_pickup: groundPickup,
      ground_origin: groundOrigin,
      load_in: loadIn,
      destination_venue: destinationVenue,
    }

    const body = renderBoardingPassMessage(bpData)

    // Generate a short-lived signed URL for the boarding pass PDF.
    let media_url: string | undefined
    if (assignment.boarding_pass_document_id) {
      const { data: doc } = await admin
        .from('documents')
        .select('storage_path')
        .eq('id', assignment.boarding_pass_document_id)
        .single()

      if (doc?.storage_path) {
        const { data: signedUrl } = await admin.storage
          .from('documents')
          .createSignedUrl(doc.storage_path, 60 * 60 * SEND_HOURS_BEFORE_DEPARTURE)
        media_url = signedUrl?.signedUrl
      }
    }

    await sendWhatsApp({ to, body, media_url })

    return { sent: true, to }
  },
})
