import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { DateSidebar } from '@/components/schedule/date-sidebar'
import { DayTimeline } from '@/components/schedule/day-timeline'
import { DayInfoPanel } from '@/components/schedule/day-info-panel'
import { DayViewClient } from '@/components/schedule/day-view-client'
import type { DayPanelData } from '@/components/schedule/day-view-client'

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: dateParam } = await searchParams

  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: tour }, { data: tourDates }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, timezone, artists(name)')
      .eq('id', id)
      .eq('account_id', user.id)
      .single(),
    supabase
      .from('tour_dates')
      .select('id, date, day_type, notes')
      .eq('tour_id', id)
      .order('date', { ascending: true }),
  ])

  if (!tour) redirect('/')

  const dates = tourDates ?? []
  const today = new Date().toISOString().slice(0, 10)

  const selectedDate =
    dateParam ??
    (dates.some((d) => d.date === today) ? today : (dates[0]?.date ?? today))

  const tourDate = dates.find((d) => d.date === selectedDate) ?? null
  const tz = tour.timezone ?? 'UTC'

  // Fetch panel data server-side so the edit panels have records to render
  // without a separate client-side fetch when a card is clicked.
  let panelData: DayPanelData = { shows: [], segments: [], hotels: [], events: [], timezone: tz }

  if (tourDate) {
    const nextDate = new Date(new Date(`${selectedDate}T00:00:00Z`).getTime() + 86_400_000)
      .toISOString()
      .slice(0, 10)

    const [
      { data: shows },
      { data: linkedSegs },
      { data: datedSegs },
      { data: linkedHotels },
      { data: checkinHotels },
      { data: checkoutHotels },
      { data: events },
    ] = await Promise.all([
      supabase
        .from('shows')
        .select(`id, venue_name, day_sheets (
          venue_access, load_in, line_check, soundcheck, vip,
          doors, support_on, support_off, changeover,
          headliner_on, headliner_off, curfew, load_out, hotel_departure
        )`)
        .eq('tour_id', id)
        .eq('tour_date_id', tourDate.id),

      supabase
        .from('transport_segments')
        .select('id, mode, origin, destination, depart_at, arrive_at, carrier_operator, vehicle_or_flight_no, booking_reference, status')
        .eq('tour_id', id)
        .eq('tour_date_id', tourDate.id),

      supabase
        .from('transport_segments')
        .select('id, mode, origin, destination, depart_at, arrive_at, carrier_operator, vehicle_or_flight_no, booking_reference, status')
        .eq('tour_id', id)
        .is('tour_date_id', null)
        .gte('depart_at', `${selectedDate}T00:00:00Z`)
        .lt('depart_at', `${nextDate}T00:00:00Z`),

      supabase
        .from('hotel_stays')
        .select('id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password')
        .eq('tour_id', id)
        .eq('tour_date_id', tourDate.id),

      supabase
        .from('hotel_stays')
        .select('id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password')
        .eq('tour_id', id)
        .is('tour_date_id', null)
        .eq('check_in_date', selectedDate),

      supabase
        .from('hotel_stays')
        .select('id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password')
        .eq('tour_id', id)
        .is('tour_date_id', null)
        .eq('check_out_date', selectedDate)
        .neq('check_in_date', selectedDate),

      supabase
        .from('day_events')
        .select('id, title, starts_at, ends_at, location, notes')
        .eq('tour_id', id)
        .eq('date', selectedDate)
        .neq('title', '__day_notes__'),
    ])

    // Deduplicate segments.
    const segMap = new Map<string, NonNullable<typeof linkedSegs>[number]>()
    for (const s of [...(linkedSegs ?? []), ...(datedSegs ?? [])]) segMap.set(s.id, s)

    // Deduplicate hotels.
    const hotelMap = new Map<string, NonNullable<typeof linkedHotels>[number]>()
    for (const h of [...(linkedHotels ?? []), ...(checkinHotels ?? []), ...(checkoutHotels ?? [])]) {
      hotelMap.set(h.id, h)
    }

    panelData = {
      shows: (shows ?? []).map((s) => ({
        id: s.id,
        venue_name: s.venue_name,
        day_sheets: Array.isArray(s.day_sheets) ? (s.day_sheets[0] ?? null) : s.day_sheets ?? null,
      })),
      segments: Array.from(segMap.values()),
      hotels: Array.from(hotelMap.values()),
      events: events ?? [],
      timezone: tz,
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      <DateSidebar
        tourId={id}
        dates={dates}
        selectedDate={selectedDate}
      />

      <DayViewClient
        panelData={panelData}
        timeline={
          tourDate ? (
            <DayTimeline
              tourId={id}
              tourDateId={tourDate.id}
              date={selectedDate}
              timezone={tz}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <p className="text-sm text-muted-foreground">No data for this day.</p>
            </div>
          )
        }
        dayInfoPanel={
          <DayInfoPanel
            tourId={id}
            date={selectedDate}
            tourDateId={tourDate?.id ?? null}
            timezone={tz}
          />
        }
      />
    </div>
  )
}
