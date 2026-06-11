import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, MapPin, ExternalLink, Plane, Train, Bus, Truck, Car } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'

const MODE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  flight: Plane,
  rail: Train,
  bus: Bus,
  truck: Truck,
  ground: Car,
  hire: Car,
}

// ---- Helpers ----------------------------------------------------------------

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'Show Day',
  rehearsal: 'Rehearsal',
  travel: 'Travel Day',
  press: 'Press Day',
  day_off: 'Day Off',
}

const DAY_TYPE_COLOUR: Record<string, string> = {
  show: 'bg-green-500',
  rehearsal: 'bg-blue-500',
  travel: 'bg-amber-400',
  press: 'bg-purple-500',
  day_off: 'bg-stone-400',
}

function formatFullDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function formatDateTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

const MODE_LABELS: Record<string, string> = {
  flight: 'Flight',
  rail: 'Train',
  bus: 'Coach',
  truck: 'Truck',
  ground: 'Ground',
  hire: 'Hire car',
}

// ---- Sections ---------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      {title}
    </h2>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value || value === 'TBC') return null
  return (
    <div className="flex items-baseline justify-between py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  )
}

// ---- Page -------------------------------------------------------------------

export default async function DayViewPage({
  params,
}: {
  params: Promise<{ id: string; date: string }>
}) {
  const { id, date } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name), timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const tz = tour.timezone ?? 'UTC'

  // Fetch the tour_date row with show and rehearsal attached.
  const { data: tourDate } = await supabase
    .from('tour_dates')
    .select(`
      id, date, day_type, notes,
      shows (
        id, venue_name, address, load_in_at, curfew_at,
        day_sheets (
          venue_access, load_in, line_check, soundcheck, vip,
          doors, support_on, support_off, changeover,
          headliner_on, headliner_off, curfew, load_out,
          hotel_departure, lobby_call_at
        )
      ),
      rehearsals (
        id, location_name, address, google_maps_url, start_at, end_at, notes
      )
    `)
    .eq('tour_id', id)
    .eq('date', date)
    .single()

  if (!tourDate) redirect(`/tours/${id}/shows`)

  // Transport: query by tour_date_id OR by departure date (UTC day range).
  // The UTC range covers segments created before tour_date_id existed or via
  // the per-show planner where tour_date_id was never set.
  const nextDate = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)

  const [{ data: linkedSegments }, { data: datedSegments }, { data: linkedHotels }, { data: datedHotels }] =
    await Promise.all([
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
        .gte('depart_at', `${date}T00:00:00Z`)
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
        .eq('check_in_date', date),
    ])

  // Merge and deduplicate by id.
  const segmentMap = new Map<string, typeof linkedSegments extends (infer T)[] | null ? T : never>()
  for (const s of [...(linkedSegments ?? []), ...(datedSegments ?? [])]) {
    segmentMap.set(s.id, s)
  }
  const segments = Array.from(segmentMap.values()).sort((a, b) =>
    (a.depart_at ?? '').localeCompare(b.depart_at ?? '')
  )

  const hotelMap = new Map<string, typeof linkedHotels extends (infer T)[] | null ? T : never>()
  for (const h of [...(linkedHotels ?? []), ...(datedHotels ?? [])]) {
    hotelMap.set(h.id, h)
  }
  const hotels = Array.from(hotelMap.values())

  const show = Array.isArray(tourDate.shows) ? tourDate.shows[0] : tourDate.shows ?? null
  const rehearsal = Array.isArray(tourDate.rehearsals) ? tourDate.rehearsals[0] : tourDate.rehearsals ?? null

  const daySheet = show
    ? (Array.isArray(show.day_sheets) ? show.day_sheets[0] : show.day_sheets) ?? null
    : null

  const dayType = tourDate.day_type as string

  return (
    <PageLayout maxWidth="max-w-2xl">
      {/* Back link */}
      <div className="mb-6">
        <Link
          href={`/tours/${id}/shows`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Schedule
        </Link>
      </div>

      {/* Day header */}
      <div className="flex items-center gap-3 mb-8">
        <span className={`h-10 w-1.5 rounded-full shrink-0 ${DAY_TYPE_COLOUR[dayType] ?? 'bg-stone-400'}`} />
        <div>
          <p className="text-sm font-medium text-muted-foreground">{DAY_TYPE_LABELS[dayType] ?? dayType}</p>
          <h1 className="text-2xl font-semibold">{formatFullDate(date)}</h1>
        </div>
      </div>

      <div className="space-y-10">

        {/* Show section */}
        {show && (
          <div>
            <SectionHeader title="Show" />
            <div className="rounded-lg border p-4 space-y-1">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold">{show.venue_name}</p>
                  {show.address && (
                    <p className="text-sm text-muted-foreground mt-0.5">{show.address}</p>
                  )}
                </div>
                <Link
                  href={`/tours/${id}/shows/${show.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0 flex items-center gap-1"
                >
                  Full details
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </div>

              {daySheet ? (
                <>
                  {daySheet.lobby_call_at && (
                    <Row label="Lobby call" value={formatTime(daySheet.lobby_call_at, tz)} />
                  )}
                  <Row label="Venue access" value={formatTime(daySheet.venue_access, tz)} />
                  <Row label="Load-in" value={formatTime(daySheet.load_in, tz)} />
                  <Row label="Line check" value={formatTime(daySheet.line_check, tz)} />
                  <Row label="Soundcheck" value={formatTime(daySheet.soundcheck, tz)} />
                  <Row label="VIP" value={formatTime(daySheet.vip, tz)} />
                  <Row label="Doors" value={formatTime(daySheet.doors, tz)} />
                  <Row label="Support on" value={formatTime(daySheet.support_on, tz)} />
                  <Row label="Support off" value={formatTime(daySheet.support_off, tz)} />
                  <Row label="Changeover" value={formatTime(daySheet.changeover, tz)} />
                  <Row label="Headliner on" value={formatTime(daySheet.headliner_on, tz)} />
                  <Row label="Headliner off" value={formatTime(daySheet.headliner_off, tz)} />
                  <Row label="Curfew" value={formatTime(daySheet.curfew, tz)} />
                  <Row label="Load-out" value={formatTime(daySheet.load_out, tz)} />
                  <Row label="Hotel departure" value={formatTime(daySheet.hotel_departure, tz)} />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No day sheet times yet.</p>
              )}
            </div>
          </div>
        )}

        {/* Rehearsal section */}
        {rehearsal && (
          <div>
            <SectionHeader title="Rehearsal" />
            <div className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold">{rehearsal.location_name}</p>
                  {rehearsal.address && (
                    <p className="text-sm text-muted-foreground mt-0.5">{rehearsal.address}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {rehearsal.google_maps_url && (
                    <a
                      href={rehearsal.google_maps_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      <MapPin className="h-3 w-3" />
                      Maps
                    </a>
                  )}
                  <Link
                    href={`/tours/${id}/rehearsals/${rehearsal.id}`}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    Edit
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
              <Row label="Start" value={formatTime(rehearsal.start_at, tz)} />
              <Row label="End" value={formatTime(rehearsal.end_at, tz)} />
              {rehearsal.notes && (
                <p className="text-sm text-muted-foreground mt-3">{rehearsal.notes}</p>
              )}
            </div>
          </div>
        )}

        {/* Transport section */}
        {segments.length > 0 && (
          <div>
            <SectionHeader title="Transport" />
            <div className="space-y-3">
              {segments.map((seg) => (
                <div key={seg.id} className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-2">
                    {(() => { const Icon = MODE_ICON[seg.mode] ?? Car; return <Icon className="h-4 w-4 text-muted-foreground" /> })()}
                    <span className="text-sm font-medium">{MODE_LABELS[seg.mode] ?? seg.mode}</span>
                    {seg.carrier_operator && (
                      <span className="text-sm text-muted-foreground">{seg.carrier_operator}</span>
                    )}
                    {seg.vehicle_or_flight_no && (
                      <span className="text-sm text-muted-foreground">{seg.vehicle_or_flight_no}</span>
                    )}
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                      seg.status === 'booked' || seg.status === 'ticketed'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {seg.status}
                    </span>
                  </div>
                  <Row label="From" value={seg.origin ?? ''} />
                  <Row label="To" value={seg.destination ?? ''} />
                  <Row label="Departs" value={formatDateTime(seg.depart_at, tz)} />
                  <Row label="Arrives" value={formatDateTime(seg.arrive_at, tz)} />
                  {seg.booking_reference && (
                    <Row label="Reference" value={seg.booking_reference} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hotel section */}
        {hotels.length > 0 && (
          <div>
            <SectionHeader title="Lodging" />
            <div className="space-y-3">
              {hotels.map((hotel) => (
                <div key={hotel.id} className="rounded-lg border p-4">
                  <p className="font-semibold mb-1">{hotel.name ?? 'Hotel'}</p>
                  {hotel.address && (
                    <p className="text-sm text-muted-foreground mb-3">{hotel.address}</p>
                  )}
                  {hotel.check_in_date && (
                    <Row
                      label="Check-in"
                      value={`${hotel.check_in_date}${hotel.check_in_time ? ` at ${String(hotel.check_in_time).slice(0, 5)}` : ''}`}
                    />
                  )}
                  {hotel.check_out_date && (
                    <Row
                      label="Check-out"
                      value={`${hotel.check_out_date}${hotel.check_out_time ? ` at ${String(hotel.check_out_time).slice(0, 5)}` : ''}`}
                    />
                  )}
                  {hotel.wifi_network && (
                    <Row label="WiFi" value={`${hotel.wifi_network}${hotel.wifi_password ? ` / ${hotel.wifi_password}` : ''}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {tourDate.notes && (
          <div>
            <SectionHeader title="Notes" />
            <p className="text-sm text-muted-foreground">{tourDate.notes}</p>
          </div>
        )}

        {/* Empty state */}
        {!show && !rehearsal && segments.length === 0 && hotels.length === 0 && !tourDate.notes && (
          <p className="text-sm text-muted-foreground">Nothing added to this day yet.</p>
        )}

      </div>
    </PageLayout>
  )
}
