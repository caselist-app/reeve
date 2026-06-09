import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildSendKey, checkAndSet } from '@/lib/comms/idempotency'
import { sendWhatsApp } from '@/lib/comms/whatsapp'

export type BoardingPassPayload = {
  tour_id: string
  person_id: string
  assignment_id: string   // transport_assignments.id, the dedup dimension
  segment_id: string
}

// Triggered when the TM uploads a boarding pass against a transport_assignment.
// Scheduled at depart_at minus N hours so the crew member gets it with time
// to print or save. Dedup dimension: assignment id. One send ever per assignment.
const SEND_HOURS_BEFORE_DEPARTURE = 4

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
        people ( whatsapp_number, sms_number, preferred_channel, name ),
        transport_segments (
          mode, origin, destination, depart_at, arrive_at,
          carrier_operator, vehicle_or_flight_no
        )
      `)
      .eq('id', payload.assignment_id)
      .single()

    if (!assignment) return { skipped: true, reason: 'assignment_not_found' }

    const person = assignment.people as {
      whatsapp_number: string | null
      sms_number: string | null
      preferred_channel: string | null
      name: string
    } | null

    const seg = assignment.transport_segments as {
      mode: string
      origin: string | null
      destination: string | null
      depart_at: string | null
      arrive_at: string | null
      carrier_operator: string | null
      vehicle_or_flight_no: string | null
    } | null

    if (!person?.whatsapp_number && !person?.sms_number) {
      return { skipped: true, reason: 'no_contact_number' }
    }

    const to = person.whatsapp_number ?? person.sms_number!

    // Build the contextual message to accompany the boarding pass.
    const lines: string[] = [`Your boarding pass for ${seg?.vehicle_or_flight_no ?? seg?.mode ?? 'your journey'}.`]
    if (seg?.origin && seg?.destination) {
      lines.push(`${seg.origin} -> ${seg.destination}`)
    }
    if (seg?.depart_at) {
      lines.push(`Departs: ${new Date(seg.depart_at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`)
    }
    if (assignment.seat) lines.push(`Seat: ${assignment.seat}`)
    if (assignment.ticket_reference) lines.push(`Ref: ${assignment.ticket_reference}`)

    const body = lines.join('\n')

    // Get the boarding pass document URL from Supabase Storage if available.
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
