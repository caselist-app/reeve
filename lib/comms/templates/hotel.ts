import { createAdminClient } from '@/lib/supabase/admin'

// /hotel slash command. Zero-AI template render.
// Returns the person's next hotel stay.

export async function renderHotel(
  person_id: string,
  tour_id: string
): Promise<string> {
  const admin = createAdminClient()

  const today = new Date().toISOString().split('T')[0]

  const { data: assignment } = await admin
    .from('room_assignments')
    .select(`
      room_tier,
      room_type,
      hotel_stays (
        name,
        address,
        phone,
        check_in_date,
        check_in_time,
        check_out_date,
        check_out_time,
        wifi_network,
        wifi_password,
        confirmation_number
      )
    `)
    .eq('person_id', person_id)
    .eq('tour_id', tour_id)
    .gte('hotel_stays.check_in_date', today)
    .order('hotel_stays.check_in_date', { ascending: true })
    .limit(1)
    .single()

  if (!assignment) return 'No upcoming hotel on this tour.'

  const hotel = assignment.hotel_stays as {
    name: string | null
    address: string | null
    phone: string | null
    check_in_date: string | null
    check_in_time: string | null
    check_out_date: string | null
    check_out_time: string | null
    wifi_network: string | null
    wifi_password: string | null
    confirmation_number: string | null
  } | null

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
