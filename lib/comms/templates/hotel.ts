import { createAdminClient } from '@/lib/supabase/admin'

// /hotel slash command. Zero-AI template render.
// Returns the person's next hotel stay.

export async function renderHotel(
  person_id: string,
  tour_id: string
): Promise<string> {
  const admin = createAdminClient()

  const today = new Date().toISOString().split('T')[0]

  // Query the stays, not the assignments. A PostgREST filter on an embedded
  // resource does not filter the parent rows, and the top level cannot be
  // ordered by an embedded column, so filtering room_assignments on
  // hotel_stays.check_in_date returned an arbitrary assignment and rendered
  // "No upcoming hotel" whenever that one happened to be in the past. Same bug
  // the travel render had. See lib/comms/templates/travel.ts.
  const { data: stays, error: staysError } = await admin
    .from('hotel_stays')
    .select(`
      name,
      address,
      phone,
      check_in_date,
      check_in_time,
      check_out_date,
      check_out_time,
      wifi_network,
      wifi_password,
      confirmation_number,
      room_assignments!inner (
        person_id
      )
    `)
    .eq('tour_id', tour_id)
    .eq('room_assignments.person_id', person_id)
    .gte('check_in_date', today)
    .order('check_in_date', { ascending: true })
    .limit(1)

  // See the note in itinerary.ts: a failed query must not render as an empty
  // tour. Like the travel render, this one has already told a crew member
  // "nothing upcoming" while data existed, so it does not get to say it wrongly
  // twice.
  if (staysError) {
    console.error('[hotel] stay lookup failed:', staysError.message, { tour_id, person_id })
    return 'Could not load your hotel just now. Try again in a moment.'
  }

  const hotel = stays?.[0]

  if (!hotel?.name) return 'No upcoming hotel on this tour.'

  const lines: string[] = [
    `*${hotel.name}*`,
    hotel.address ?? '',
    hotel.phone ? `Tel: ${hotel.phone}` : '',
    ``,
    `Check in: ${hotel.check_in_date ?? 'TBC'}${hotel.check_in_time ? ' at ' + hotel.check_in_time.slice(0, 5) : ''}`,
    `Check out: ${hotel.check_out_date ?? 'TBC'}${hotel.check_out_time ? ' at ' + hotel.check_out_time.slice(0, 5) : ''}`,
  ]

  if (hotel.confirmation_number) {
    lines.push(`Confirmation: ${hotel.confirmation_number}`)
  }

  if (hotel.wifi_network) {
    lines.push(``)
    lines.push(`WiFi: ${hotel.wifi_network}`)
    if (hotel.wifi_password) lines.push(`Password: ${hotel.wifi_password}`)
  }

  return lines.filter(Boolean).join('\n')
}
