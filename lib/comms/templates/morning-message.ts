import { createAdminClient } from '@/lib/supabase/admin'
import { fetchShowItems, firstItemOfKind } from '@/lib/schedule/day-items'

// Zero-AI morning message. Renders directly from the spine.
// Sent on show days to each person over WhatsApp.
// Source of truth: the show's day_items, show venue, hotel check-out.
//
// One value per kind, because this feeds a Meta template with fixed
// placeholders. See lib/comms/blocks/show-times.ts: the collapse is the
// channel's constraint, not a return to columns.

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
    showItems,
    { data: roomAssignment },
  ] = await Promise.all([
    admin.from('people').select('contacts(name)').eq('id', person_id).single(),
    admin.from('shows').select('venue_name, date').eq('id', show_id).single(),
    fetchShowItems(admin, show_id),
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

  // Null rather than a message with every time missing. The caller skips the
  // send on null, which is the right answer: a morning message that says the
  // show has no load-in, to everyone on the tour, because a query failed, is a
  // thing the TM would have to correct by hand to fifteen people.
  if (showItems.error) {
    console.error('[morning-message] day items lookup failed:', showItems.error, { show_id })
    return null
  }

  const at = (kind: string) => firstItemOfKind(showItems.items, kind)?.starts_at ?? null

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
    load_in: at('load_in'),
    soundcheck: at('soundcheck'),
    doors: at('doors'),
    // The headliner set is one windowed item now (REE-100); its start is the
    // on-stage time. See lib/comms/blocks/show-times.ts.
    headliner_on: at('headliner'),
    curfew: at('curfew'),
    hotel_name: hotel?.name ?? null,
    hotel_checkout: hotelCheckout,
  }
}
