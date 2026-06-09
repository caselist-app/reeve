import { createAdminClient } from '@/lib/supabase/admin'

// TourContext is assembled once per inference call and passed explicitly
// in the user turn. Claude has no standing database access. It never sees
// data from more than one tour.

export type TourContext = {
  tour: {
    id: string
    name: string
    artist_act: string
    territory: string | null
    base_currency: string
  }
  shows: Array<{
    id: string
    date: string
    venue_name: string
    address: string | null
    venue_type: string | null
    load_in_at: string | null
    curfew_at: string | null
    advance: {
      status_audio: string
      status_lighting: string
      status_staging: string
      status_hospitality: string
      status_travel: string
    } | null
    day_sheet: {
      venue_access: string | null
      load_in: string | null
      soundcheck: string | null
      doors: string | null
      headliner_on: string | null
      curfew: string | null
      hotel_departure: string | null
    } | null
  }>
  people: Array<{
    id: string
    name: string
    person_type: string
    role: string | null
    preferred_channel: string | null
    whatsapp_number: string | null
    home_city: string | null
    dietary: string | null
    allergies: string | null
    passport_expiry: string | null
    passport_country: string | null
  }>
  transport: Array<{
    id: string
    mode: string
    origin: string | null
    destination: string | null
    depart_at: string | null
    arrive_at: string | null
    carrier_operator: string | null
    vehicle_or_flight_no: string | null
    booking_reference: string | null
    status: string
    assignments: Array<{
      person_id: string
      seat: string | null
      ticket_reference: string | null
    }>
  }>
  hotels: Array<{
    id: string
    name: string | null
    city: string | null
    check_in_date: string | null
    check_out_date: string | null
    check_in_time: string | null
    check_out_time: string | null
    wifi_network: string | null
    confirmation_number: string | null
    assignments: Array<{
      person_id: string
      room_tier: string
      room_type: string | null
    }>
  }>
  attention_items: Array<{
    kind: string
    severity: number
    title: string
    detail: string | null
  }>
}

export async function assembleTourContext(tour_id: string): Promise<TourContext> {
  const admin = createAdminClient()

  const [tourRes, showsRes, peopleRes, transportRes, hotelsRes, attentionRes] =
    await Promise.all([
      admin.from('tours').select('id, name, artist_act, territory, base_currency').eq('id', tour_id).single(),
      admin
        .from('shows')
        .select(`
          id, date, venue_name, address, venue_type, load_in_at, curfew_at,
          show_advance ( status_audio, status_lighting, status_staging, status_hospitality, status_travel ),
          day_sheets ( venue_access, load_in, soundcheck, doors, headliner_on, curfew, hotel_departure )
        `)
        .eq('tour_id', tour_id)
        .order('date', { ascending: true }),
      admin
        .from('people')
        .select('id, name, person_type, role, preferred_channel, whatsapp_number, home_city, dietary, allergies, passport_expiry, passport_country')
        .eq('tour_id', tour_id),
      admin
        .from('transport_segments')
        .select(`
          id, mode, origin, destination, depart_at, arrive_at,
          carrier_operator, vehicle_or_flight_no, booking_reference, status,
          transport_assignments ( person_id, seat, ticket_reference )
        `)
        .eq('tour_id', tour_id)
        .order('depart_at', { ascending: true }),
      admin
        .from('hotel_stays')
        .select(`
          id, name, city, check_in_date, check_out_date, check_in_time, check_out_time,
          wifi_network, confirmation_number,
          room_assignments ( person_id, room_tier, room_type )
        `)
        .eq('tour_id', tour_id)
        .order('check_in_date', { ascending: true }),
      admin
        .from('attention_items')
        .select('kind, severity, title, detail')
        .eq('tour_id', tour_id)
        .is('resolved_at', null)
        .order('severity', { ascending: false }),
    ])

  if (!tourRes.data) throw new Error(`Tour not found: ${tour_id}`)

  return {
    tour: tourRes.data,
    shows: (showsRes.data ?? []).map((s) => ({
      id: s.id,
      date: s.date,
      venue_name: s.venue_name,
      address: s.address,
      venue_type: s.venue_type,
      load_in_at: s.load_in_at,
      curfew_at: s.curfew_at,
      advance: Array.isArray(s.show_advance) ? (s.show_advance[0] ?? null) : (s.show_advance ?? null),
      day_sheet: Array.isArray(s.day_sheets) ? (s.day_sheets[0] ?? null) : (s.day_sheets ?? null),
    })),
    people: peopleRes.data ?? [],
    transport: (transportRes.data ?? []).map((t) => ({
      id: t.id,
      mode: t.mode,
      origin: t.origin,
      destination: t.destination,
      depart_at: t.depart_at,
      arrive_at: t.arrive_at,
      carrier_operator: t.carrier_operator,
      vehicle_or_flight_no: t.vehicle_or_flight_no,
      booking_reference: t.booking_reference,
      status: t.status,
      assignments: Array.isArray(t.transport_assignments) ? t.transport_assignments : [],
    })),
    hotels: (hotelsRes.data ?? []).map((h) => ({
      id: h.id,
      name: h.name,
      city: h.city,
      check_in_date: h.check_in_date,
      check_out_date: h.check_out_date,
      check_in_time: h.check_in_time,
      check_out_time: h.check_out_time,
      wifi_network: h.wifi_network,
      confirmation_number: h.confirmation_number,
      assignments: Array.isArray(h.room_assignments) ? h.room_assignments : [],
    })),
    attention_items: attentionRes.data ?? [],
  }
}
