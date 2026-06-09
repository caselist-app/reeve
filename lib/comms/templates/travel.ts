import { createAdminClient } from '@/lib/supabase/admin'

// /travel slash command. Zero-AI template render.
// Returns the person's next booked transport segment.

function formatDateTime(iso: string | null): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export async function renderTravel(
  person_id: string,
  tour_id: string
): Promise<string> {
  const admin = createAdminClient()

  const now = new Date().toISOString()

  // Find the next transport assignment for this person.
  const { data: assignment } = await admin
    .from('transport_assignments')
    .select(`
      seat,
      ticket_reference,
      transport_segments (
        mode,
        origin,
        destination,
        depart_at,
        arrive_at,
        carrier_operator,
        vehicle_or_flight_no,
        booking_reference,
        status,
        book_url
      )
    `)
    .eq('person_id', person_id)
    .eq('tour_id', tour_id)
    .gt('transport_segments.depart_at', now)
    .order('transport_segments.depart_at', { ascending: true })
    .limit(1)
    .single()

  if (!assignment) return 'No upcoming travel on this tour.'

  const seg = assignment.transport_segments as {
    mode: string
    origin: string | null
    destination: string | null
    depart_at: string | null
    arrive_at: string | null
    carrier_operator: string | null
    vehicle_or_flight_no: string | null
    booking_reference: string | null
    status: string
    book_url: string | null
  } | null

  if (!seg) return 'No upcoming travel on this tour.'

  const modeLabel = seg.mode.charAt(0).toUpperCase() + seg.mode.slice(1)

  const lines: string[] = [
    `*Next travel: ${modeLabel}*`,
    `${seg.origin ?? 'TBC'} -> ${seg.destination ?? 'TBC'}`,
    `Departs: ${formatDateTime(seg.depart_at)}`,
    `Arrives: ${formatDateTime(seg.arrive_at)}`,
  ]

  if (seg.carrier_operator) lines.push(`Carrier: ${seg.carrier_operator}`)
  if (seg.vehicle_or_flight_no) lines.push(`Flight/train: ${seg.vehicle_or_flight_no}`)
  if (assignment.seat) lines.push(`Seat: ${assignment.seat}`)
  if (seg.booking_reference) lines.push(`Ref: ${seg.booking_reference}`)

  if (seg.status === 'planned' && seg.book_url) {
    lines.push(``)
    lines.push(`Not yet booked. Book at: ${seg.book_url}`)
  }

  return lines.join('\n')
}
