import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTemplate } from '@/lib/comms/whatsapp'
import {
  buildLegLabel,
  formatDeparture,
  formatTime,
  renderBoardingPassMessage,
  type BoardingPassData,
} from '@/lib/comms/templates/boarding-pass'

// Template ID for the approved Meta boarding-pass template.
// Set in env once Meta approves. Until then, proactive sends are skipped.
const BOARDING_PASS_TEMPLATE = process.env.WHATSAPP_TEMPLATE_BOARDING_PASS

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
    const admin = createAdminClient()

    // Claim the send slot atomically. A unique violation means already sent.
    // On success, the row is in 'queued' state until the send completes.
    // On send failure, the row is deleted so a job retry can re-attempt.
    const claimKey = {
      tour_id: payload.tour_id,
      person_id: payload.person_id,
      notification_type: 'boarding_pass' as const,
      channel: 'whatsapp' as const,
      dedup_dimension: payload.assignment_id,
    }
    const { error: claimError } = await admin
      .from('notification_log')
      .insert({ ...claimKey, status: 'queued' })

    if (claimError?.code === '23505') return { skipped: true, reason: 'already_sent' }
    if (claimError) throw new Error(`[boarding-pass] claim failed: ${claimError.message}`)

    const { data: assignment } = await admin
      .from('transport_assignments')
      .select(`
        seat,
        ticket_reference,
        boarding_pass_document_id,
        people ( contacts ( name, whatsapp_number ) ),
        transport_segments (
          mode, origin, destination, depart_at, arrive_at,
          carrier_operator, vehicle_or_flight_no, tour_id
        )
      `)
      .eq('id', payload.assignment_id)
      .single()

    if (!assignment) return { skipped: true, reason: 'assignment_not_found' }

    const personRow = assignment.people as {
      contacts: { name: string; whatsapp_number: string | null } | null
    } | null
    const person = personRow?.contacts ?? null

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

    if (!person?.whatsapp_number) {
      return { skipped: true, reason: 'no_contact_number' }
    }

    const to = person.whatsapp_number

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

    // Gate on the approved template. Proactive sends outside the 24-hour window
    // silently fail on Meta's side unless sent as an approved template.
    if (!BOARDING_PASS_TEMPLATE) {
      await admin.from('notification_log').delete().match(claimKey)
      console.warn('[boarding-pass] WHATSAPP_TEMPLATE_BOARDING_PASS not configured, skipping send')
      return { skipped: true, reason: 'template_not_configured' }
    }

    // Generate a short-lived signed URL for the boarding pass PDF.
    let documentLink: string | undefined
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
        documentLink = signedUrl?.signedUrl
      }
    }

    try {
      const result = await sendTemplate({
        to,
        templateName: BOARDING_PASS_TEMPLATE,
        languageCode: 'en',
        bodyParams: [body],
        ...(documentLink
          ? { headerDocument: { link: documentLink, filename: 'boarding-pass.pdf' } }
          : {}),
      })

      await admin
        .from('notification_log')
        .update({ status: 'sent', sent_at: new Date().toISOString(), provider_message_id: result.wamid })
        .match(claimKey)

      return { sent: true, to }
    } catch (err) {
      // Release the claim so a job retry can re-attempt.
      await admin.from('notification_log').delete().match(claimKey)
      throw err
    }
  },
})
