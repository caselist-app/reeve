import { createAdminClient } from '@/lib/supabase/admin'

// Zero-AI morning message. Renders directly from the spine.
// Sent on show days to each person over WhatsApp.
// Source of truth: day_sheet times, show venue, hotel check-out.

export type MorningMessageData = {
  // First name only, split from full name at the caller.
  person_first_name: string
  venue_name: string
  // YYYY-MM-DD in the tour's local timezone.
  show_date: string
  // IANA timezone string for the tour (e.g. "Europe/London").
  timezone: string
  // timestamptz ISO strings, formatted into timezone at render time.
  load_in: string | null
  soundcheck: string | null
  doors: string | null
  headliner_on: string | null
  curfew: string | null
  hotel_name: string | null
  // Wall clock checkout time as "HH:MM", already in local time, display directly.
  hotel_checkout: string | null
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
    admin.from('people').select('contacts(name)').eq('id', person_id).single(),
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

  // First name only: everything before the first space. Name lives on the contact.
  const personName = (person.contacts as { name: string } | null)?.name ?? ''
  const firstName = personName.split(' ')[0]

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
