import { TimelineCard } from '@/components/schedule/timeline-card'
import { DayHeader } from '@/components/schedule/day-header'
import type { DayRecords } from '@/lib/schedule/day-records'

interface DayTimelineProps {
  records: DayRecords
  tourId: string
  tourDateId: string
  date: string       // YYYY-MM-DD
  timezone: string
  dayType: string
  tourName: string
  notes: string | null
  customTitle: string | null
}

// ---- Helpers ----------------------------------------------------------------

function formatTime(iso: string | null, tz: string): string {
  if (!iso) return '--:--'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

// Returns a sortable ISO string. Falls back to midnight so null-time items
// sort to the top of the day rather than disappearing.
function sortKey(iso: string | null, dateFallback: string): string {
  return iso ?? `${dateFallback}T00:00:00Z`
}

// ---- Show spine -------------------------------------------------------------

const DAY_SHEET_FIELDS = [
  { key: 'lobby_call_at',   label: 'Lobby call'      },
  { key: 'venue_access',    label: 'Venue access'    },
  { key: 'load_in',         label: 'Load-in'         },
  { key: 'line_check',      label: 'Line check'      },
  { key: 'soundcheck',      label: 'Soundcheck'      },
  { key: 'vip',             label: 'VIP'             },
  { key: 'doors',           label: 'Doors'           },
  { key: 'support_on',      label: 'Support on'      },
  { key: 'support_off',     label: 'Support off'     },
  { key: 'changeover',      label: 'Changeover'      },
  { key: 'headliner_on',    label: 'Headliner on'    },
  { key: 'headliner_off',   label: 'Headliner off'   },
  { key: 'curfew',          label: 'Curfew'          },
  { key: 'load_out',        label: 'Load-out'        },
  { key: 'hotel_departure', label: 'Hotel departure' },
] as const

// ---- Component --------------------------------------------------------------

export async function DayTimeline({ records, tourId, tourDateId, date, timezone, dayType, tourName, notes, customTitle }: DayTimelineProps) {
  const header = (
    <DayHeader
      tourId={tourId}
      tourDateId={tourDateId}
      date={date}
      dayType={dayType}
      tourName={tourName}
      timezone={timezone}
      notes={notes}
      customTitle={customTitle}
    />
  )

  const { shows, segments, hotelsLinked, hotelsCheckin, hotelsCheckout, events } = records

  // Deduplicate hotels: tour_date_id-linked take precedence over date-matched.
  const hotelMap = new Map<string, { id: string; name: string | null; check_in_date: string | null; check_in_time: string | null; check_out_date: string | null; check_out_time: string | null; isCheckout: boolean }>()
  for (const h of hotelsLinked) {
    // A linked stay shows both check-in and check-out if applicable.
    if (h.check_in_date === date) {
      hotelMap.set(`checkin:${h.id}`, { ...h, isCheckout: false })
    }
    if (h.check_out_date === date) {
      hotelMap.set(`checkout:${h.id}`, { ...h, isCheckout: true })
    }
  }
  for (const h of hotelsCheckin) {
    if (!hotelMap.has(`checkin:${h.id}`)) {
      hotelMap.set(`checkin:${h.id}`, { ...h, isCheckout: false })
    }
  }
  for (const h of hotelsCheckout) {
    if (!hotelMap.has(`checkout:${h.id}`)) {
      hotelMap.set(`checkout:${h.id}`, { ...h, isCheckout: true })
    }
  }
  const hotels = Array.from(hotelMap.values())

  // Build a flat list of timeline items with a sort key.
  type TimelineItem = {
    key: string
    sortKey: string
    node: React.ReactNode
  }

  const items: TimelineItem[] = []

  // Show spine items.
  for (const show of (shows ?? [])) {
    const ds = Array.isArray(show.day_sheets) ? show.day_sheets[0] : show.day_sheets
    if (!ds) {
      // Show with no day sheet times yet: single placeholder card.
      items.push({
        key: `show-${show.id}`,
        sortKey: `${date}T00:00:00Z`,
        node: (
          <TimelineCard
            key={`show-${show.id}`}
            time="--:--"
            label="Show"
            title={show.venue_name}
            accent="border-purple-500"
            card={{ type: 'show', showId: show.id }}
          />
        ),
      })
      continue
    }

    for (const { key, label } of DAY_SHEET_FIELDS) {
      const val = ds[key as keyof typeof ds] as string | null
      if (!val) continue
      items.push({
        key: `show-${show.id}-${key}`,
        sortKey: val,
        node: (
          <TimelineCard
            key={`show-${show.id}-${key}`}
            time={formatTime(val, timezone)}
            label={label}
            title={show.venue_name}
            accent="border-purple-500"
            card={{ type: 'show', showId: show.id }}
          />
        ),
      })
    }
  }

  // Transport items.
  const MODE_LABELS: Record<string, string> = {
    flight: 'Flight',
    rail: 'Train',
    bus: 'Coach',
    truck: 'Truck',
    ground: 'Ground',
    hire: 'Hire car',
  }
  for (const seg of segments) {
    const label = MODE_LABELS[seg.mode] ?? seg.mode
    const title = [seg.origin, seg.destination].filter(Boolean).join(' to ') || label
    const subtitle = [seg.carrier_operator, seg.vehicle_or_flight_no].filter(Boolean).join(' ')
    items.push({
      key: `transport-${seg.id}`,
      sortKey: sortKey(seg.depart_at, date),
      node: (
        <TimelineCard
          key={`transport-${seg.id}`}
          time={formatTime(seg.depart_at, timezone)}
          label={label}
          title={title}
          subtitle={subtitle || undefined}
          accent="border-teal-500"
          card={{ type: 'transport', segmentId: seg.id }}
        />
      ),
    })
  }

  // Hotel items.
  for (const hotel of hotels) {
    const isCheckout = hotel.isCheckout
    const timeStr = isCheckout ? hotel.check_out_time : hotel.check_in_time
    // time fields are PostgreSQL time values: "HH:MM:SS"
    const displayTime = timeStr ? String(timeStr).slice(0, 5) : '--:--'
    const isoTime = timeStr
      ? `${isCheckout ? hotel.check_out_date : hotel.check_in_date}T${String(timeStr).slice(0, 5)}:00`
      : null
    items.push({
      key: `hotel-${isCheckout ? 'checkout' : 'checkin'}-${hotel.id}`,
      sortKey: sortKey(isoTime, date),
      node: (
        <TimelineCard
          key={`hotel-${isCheckout ? 'checkout' : 'checkin'}-${hotel.id}`}
          time={displayTime}
          label={isCheckout ? 'Hotel check-out' : 'Hotel check-in'}
          title={hotel.name ?? 'Hotel'}
          accent="border-blue-500"
          card={{ type: isCheckout ? 'hotel-checkout' : 'hotel-checkin', stayId: hotel.id }}
        />
      ),
    })
  }

  // Day event items.
  for (const ev of (events ?? [])) {
    items.push({
      key: `event-${ev.id}`,
      sortKey: sortKey(ev.starts_at, date),
      node: (
        <TimelineCard
          key={`event-${ev.id}`}
          time={formatTime(ev.starts_at, timezone)}
          label="Event"
          title={ev.title}
          subtitle={ev.location ?? undefined}
          accent="border-amber-500"
          card={{ type: 'event', eventId: ev.id }}
        />
      ),
    })
  }

  // Sort by time ascending.
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  if (items.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex-1 flex items-center justify-center px-6">
          <p className="text-sm text-muted-foreground text-center">
            Nothing added to this day yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-y-auto py-4">
        {items.map((item) => item.node)}
      </div>
    </div>
  )
}
