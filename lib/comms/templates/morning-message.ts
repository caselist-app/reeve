import { createAdminClient } from '@/lib/supabase/admin'

// Zero-AI morning message. Renders directly from the spine.
// Sent on show days to each person via their preferred_channel.
// Source of truth: day_sheet times, show venue, hotel check-out.

export type MorningMessageData = {
  // First name only — split from full name at the caller.
  person_first_name: string
  venue_name: string
  // YYYY-MM-DD in the tour's local timezone.
  show_date: string
  // IANA timezone string for the tour (e.g. "Europe/London").
  timezone: string
  // timestamptz ISO strings — formatted into timezone at render time.
  load_in: string | null
  soundcheck: string | null
  doors: string | null
  headliner_on: string | null
  curfew: string | null
  hotel_name: string | null
  // Wall clock checkout time as "HH:MM" — already in local time, display directly.
  hotel_checkout: string | null
}

// Formats a UTC timestamptz ISO string into HH:MM in the given IANA timezone.
function formatTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

export function renderMorningMessage(data: MorningMessageData): string {
  const tz = data.timezone
  const lines: string[] = [
    `Good morning ${data.person_first_name}.`,
    ``,
    `*${data.venue_name}* - ${data.show_date}`,
    ``,
  ]

  if (data.hotel_name && data.hotel_checkout) {
    lines.push(`Hotel checkout: ${data.hotel_checkout} (${data.hotel_name})`)
    lines.push(``)
  }

  lines.push(`Load in: ${formatTime(data.load_in, tz)}`)

  if (data.soundcheck) {
    lines.push(`Soundcheck: ${formatTime(data.soundcheck, tz)}`)
  }

  lines.push(`Doors: ${formatTime(data.doors, tz)}`)
  lines.push(`On stage: ${formatTime(data.headliner_on, tz)}`)
  lines.push(`Curfew: ${formatTime(data.curfew, tz)}`)
  lines.push(``)
  lines.push(`Reply /itinerary for full day details or /travel for your transport.`)

  return lines.join('\n')
}

export async function buildMorningMessageData(
  person_id: string,
  show_id: string,
  timezone: string
): Promise<MorningMessageData | null> {
  const admin = createAdminClient()

  const [
    { data: person },
    { data: show },
    { data: daySheet },
    { data: roomAssignment },
  ] = await Promise.all([
    admin.from('people').select('name').eq('id', person_id).single(),
    admin.from('shows').select('venue_name, date').eq('id', show_id).single(),
    admin
      .from('day_sheets')
      .select('load_in, soundcheck, doors, headliner_on, curfew')
      .eq('show_id', show_id)
      .maybeSingle(),
    // Find the hotel stay the person is assigned to. check_out_time is a
    // Postgres `time` column (HH:MM:SS) representing wall clock local time.
    admin
      .from('room_assignments')
      .select('hotel_stays(name, check_out_time)')
      .eq('person_id', person_id)
      .limit(1)
      .maybeSingle(),
  ])

  if (!person || !show) return null

  const hotel = roomAssignment?.hotel_stays as {
    name: string | null
    check_out_time: string | null
  } | null

  // Trim "HH:MM:SS" to "HH:MM" for display. No timezone conversion needed:
  // check_out_time is wall clock time at the hotel.
  const hotelCheckout = hotel?.check_out_time
    ? hotel.check_out_time.slice(0, 5)
    : null

  // First name only: everything before the first space.
  const firstName = person.name.split(' ')[0]

  return {
    person_first_name: firstName,
    venue_name: show.venue_name,
    show_date: show.date,
    timezone,
    load_in: daySheet?.load_in ?? null,
    soundcheck: daySheet?.soundcheck ?? null,
    doors: daySheet?.doors ?? null,
    headliner_on: daySheet?.headliner_on ?? null,
    curfew: daySheet?.curfew ?? null,
    hotel_name: hotel?.name ?? null,
    hotel_checkout: hotelCheckout,
  }
}
