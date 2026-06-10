// Zero-AI boarding pass message. Renders directly from structured data.
// Sent 3 hours before departure via WhatsApp with the PDF attached.

export type BoardingPassData = {
  person_first_name: string
  // e.g. "Flight BA442" or "Train TGV 6201" or "Ground transport"
  leg_label: string
  origin: string | null
  destination: string | null
  // Formatted local departure time string, e.g. "Mon 15 Jun, 07:45"
  depart_formatted: string
  seat: string | null
  ticket_reference: string | null
  // If there is a ground leg to the departure hub, include pickup time as "HH:MM"
  ground_pickup: string | null
  ground_origin: string | null
  // Load-in at the destination show, formatted as "HH:MM"
  load_in: string | null
  destination_venue: string | null
}

function legLabel(mode: string, carrier: string | null, flightNo: string | null): string {
  const ref = flightNo ?? ''
  const op = carrier ?? ''
  if (mode === 'flight') return `Flight ${[op, ref].filter(Boolean).join(' ')}`.trim()
  if (mode === 'rail') return `Train ${ref}`.trim()
  if (mode === 'bus') return 'Coach'
  if (mode === 'ground') return 'Ground transport'
  if (mode === 'hire') return 'Hire vehicle'
  return 'Transport'
}

export function buildLegLabel(
  mode: string,
  carrier: string | null,
  vehicleOrFlightNo: string | null
): string {
  return legLabel(mode, carrier, vehicleOrFlightNo)
}

export function renderBoardingPassMessage(data: BoardingPassData): string {
  const lines: string[] = [
    `Morning ${data.person_first_name}.`,
    ``,
    `${data.leg_label}${data.origin && data.destination ? ` - ${data.origin} to ${data.destination}` : ''}`,
    `Departs: ${data.depart_formatted}`,
  ]

  if (data.seat) lines.push(`Seat: ${data.seat}`)
  if (data.ticket_reference) lines.push(`Ref: ${data.ticket_reference}`)

  if (data.ground_pickup && data.ground_origin) {
    lines.push(``)
    lines.push(`Car from ${data.ground_origin} at ${data.ground_pickup}.`)
  }

  if (data.destination_venue && data.load_in) {
    lines.push(``)
    lines.push(`Load in at ${data.destination_venue} is ${data.load_in}.`)
  }

  lines.push(``)
  lines.push(`Boarding pass attached. Have a good trip.`)

  return lines.join('\n')
}

// Formats a UTC timestamptz ISO string for display in the given IANA timezone.
export function formatDeparture(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })
}

// Formats a UTC timestamptz ISO string to HH:MM in the given timezone.
export function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  })
}
