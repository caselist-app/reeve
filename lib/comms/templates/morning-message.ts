import { createAdminClient } from '@/lib/supabase/admin'

// Zero-AI morning message. Renders directly from the spine.
// Sent on show days to each person via their preferred_channel.
// Source of truth: day_sheet times, show venue, hotel check-out.

export type MorningMessageData = {
  person_name: string
  venue_name: string
  show_date: string
  load_in: string | null
  soundcheck: string | null
  doors: string | null
  headliner_on: string | null
  curfew: string | null
  hotel_name: string | null
  hotel_checkout_time: string | null
}

function formatTime(iso: string | null): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

export function renderMorningMessage(data: MorningMessageData): string {
  const lines: string[] = [
    `Good morning ${data.person_name}.`,
    ``,
    `*${data.venue_name}* - ${data.show_date}`,
    ``,
  ]

  if (data.hotel_name && data.hotel_checkout_time) {
    lines.push(`Hotel checkout: ${formatTime(data.hotel_checkout_time)} (${data.hotel_name})`)
    lines.push(``)
  }

  lines.push(`Load in: ${formatTime(data.load_in)}`)

  if (data.soundcheck) {
    lines.push(`Soundcheck: ${formatTime(data.soundcheck)}`)
  }

  lines.push(`Doors: ${formatTime(data.doors)}`)
  lines.push(`On stage: ${formatTime(data.headliner_on)}`)
  lines.push(`Curfew: ${formatTime(data.curfew)}`)
  lines.push(``)
  lines.push(`Reply /itinerary for full day details or /travel for your transport.`)

  return lines.join('\n')
}

export async function buildMorningMessageData(
  person_id: string,
  show_id: string
): Promise<MorningMessageData | null> {
  const admin = createAdminClient()

  const { data: person } = await admin
    .from('people')
    .select('name')
    .eq('id', person_id)
    .single()

  const { data: show } = await admin
    .from('shows')
    .select('venue_name, date')
    .eq('id', show_id)
    .single()

  const { data: daySheet } = await admin
    .from('day_sheets')
    .select('load_in, soundcheck, doors, headliner_on, curfew, hotel_departure')
    .eq('show_id', show_id)
    .single()

  // Find the hotel the person is staying at for this show.
  const { data: roomAssignment } = await admin
    .from('room_assignments')
    .select('hotel_stay_id, hotel_stays(name, check_out_time, check_out_date)')
    .eq('person_id', person_id)
    .limit(1)
    .single()

  if (!person || !show) return null

  const hotel = roomAssignment?.hotel_stays as { name: string | null; check_out_time: string | null; check_out_date: string | null } | null

  return {
    person_name: person.name,
    venue_name: show.venue_name,
    show_date: show.date,
    load_in: daySheet?.load_in ?? null,
    soundcheck: daySheet?.soundcheck ?? null,
    doors: daySheet?.doors ?? null,
    headliner_on: daySheet?.headliner_on ?? null,
    curfew: daySheet?.curfew ?? null,
    hotel_name: hotel?.name ?? null,
    hotel_checkout_time: hotel?.check_out_time
      ? `${hotel.check_out_date}T${hotel.check_out_time}Z`
      : null,
  }
}
