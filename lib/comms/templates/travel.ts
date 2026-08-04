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

  // Query the segments, not the assignments. In PostgREST a filter on an
  // embedded resource does not filter the parent rows, it only decides whether
  // the nested object comes back null, and the top level cannot be ordered by
  // an embedded column at all. Selecting from transport_assignments and
  // filtering on transport_segments.depart_at therefore returned an arbitrary
  // assignment, and if its segment was in the past the nested object came back
  // null and this rendered "No upcoming travel" while travel existed.
  //
  // Selecting from transport_segments puts depart_at on the top level where the
  // filter and the ordering both work, and transport_assignments!inner scopes it
  // to segments this person is actually assigned to. Same shape as the itinerary
  // render, which queries shows directly and has always been correct.
  const { data: segments } = await admin
    .from('transport_segments')
    .select(`
      mode,
      origin,
      destination,
      depart_at,
      arrive_at,
      carrier_operator,
      vehicle_or_flight_no,
      booking_reference,
      status,
      book_url,
      transport_assignments!inner (
        seat,
        ticket_reference,
        person_id
      )
    `)
    .eq('tour_id', tour_id)
    .eq('transport_assignments.person_id', person_id)
    .gt('depart_at', now)
    .order('depart_at', { ascending: true })
    .limit(1)

  const seg = segments?.[0]

  if (!seg) return 'No upcoming travel on this tour.'

  // The inner join guarantees at least one assignment row, and a person is
  // assigned to a given segment at most once.
  const assignment = (seg.transport_assignments ?? [])[0] as
    | { seat: string | null; ticket_reference: string | null }
    | undefined

  const modeLabel = seg.mode.charAt(0).toUpperCase() + seg.mode.slice(1)

  const lines: string[] = [
    `*Next travel: ${modeLabel}*`,
    `${seg.origin ?? 'TBC'} -> ${seg.destination ?? 'TBC'}`,
    `Departs: ${formatDateTime(seg.depart_at)}`,
    `Arrives: ${formatDateTime(seg.arrive_at)}`,
  ]

  if (seg.carrier_operator) lines.push(`Carrier: ${seg.carrier_operator}`)
  if (seg.vehicle_or_flight_no) lines.push(`Flight/train: ${seg.vehicle_or_flight_no}`)
  if (assignment?.seat) lines.push(`Seat: ${assignment.seat}`)
  if (seg.booking_reference) lines.push(`Ref: ${seg.booking_reference}`)

  if (seg.status === 'planned' && seg.book_url) {
    lines.push(``)
    lines.push(`Not yet booked. Book at: ${seg.book_url}`)
  }

  return lines.join('\n')
}
