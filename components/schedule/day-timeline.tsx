import { TimelineCard } from '@/components/schedule/timeline-card'
import { DayHeader } from '@/components/schedule/day-header'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { placeName } from '@/lib/utils/place-name'
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

  // Which hotels belong to this day, and whether each card is a check-in or a
  // check-out, is decided in fetchDayRecords now. It used to be reassembled
  // here from three overlapping buckets, which is where an edited stay could
  // fall through every one of them and render on no day at all.
  const { shows, segments, hotels, events } = records

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
            card={{
              type: 'show',
              key: `show-${show.id}`,
              showId: show.id,
              venueName: show.venue_name,
              timezone,
              daySheet: null,
            }}
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
            card={{
              type: 'show',
              key: `show-${show.id}`,
              showId: show.id,
              venueName: show.venue_name,
              timezone,
              daySheet: ds,
            }}
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
  // Flight numbers are stored as "CX150" (airline IATA code + digits, per the
  // Add Flight flow and the older manual entry form). AirLabs serves airline
  // logos from a static URL keyed by that same code, no API call involved.
  const FLIGHT_CODE_PATTERN = /^([A-Za-z]{2,3})\d+/
  function logoIataCodeFor(seg: (typeof segments)[number]): string | null {
    if (seg.mode !== 'flight' || !seg.vehicle_or_flight_no) return null
    const match = seg.vehicle_or_flight_no.match(FLIGHT_CODE_PATTERN)
    return match ? match[1].toUpperCase() : null
  }

  for (const seg of segments) {
    const label = MODE_LABELS[seg.mode] ?? seg.mode
    // Flight title is just city names ("Brisbane to Hong Kong"), stripped of
    // "Airport"/IATA-code suffix - the full airport names are already
    // redundant once the compact icon/time row below shows the codes.
    const title =
      seg.mode === 'flight'
        ? [placeName(seg.origin, seg.origin_iata), placeName(seg.destination, seg.destination_iata)]
            .filter(Boolean)
            .join(' to ') || label
        : [seg.origin, seg.destination].filter(Boolean).join(' to ') || label
    // Flight subtitle is just the flight number ("CX 150"); the logo already
    // identifies the airline, and full carrier name plus code was redundant.
    // Other modes keep carrier + reference as before.
    const subtitle =
      seg.mode === 'flight'
        ? formatFlightNumber(seg.vehicle_or_flight_no)
        : [seg.carrier_operator, seg.vehicle_or_flight_no].filter(Boolean).join(' ')
    const flightTimes =
      seg.mode === 'flight'
        ? {
            originIata: seg.origin_iata,
            originTime: formatTime(seg.depart_at, timezone),
            destinationIata: seg.destination_iata,
            destinationTime: formatTime(seg.arrive_at, timezone),
            // Same rule as the flight edit panel: only stamped once the
            // AirLabs lookup's date matched the TM's chosen date, or the
            // live tracking job (Commit 6) has polled it.
            live: !!seg.last_tracked_at,
          }
        : undefined
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
          card={{ type: 'transport', key: `transport-${seg.id}`, segment: seg, timezone }}
          logoIataCode={logoIataCodeFor(seg)}
          flightTimes={flightTimes}
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
          card={{
            type: 'hotel',
            key: `hotel-${isCheckout ? 'checkout' : 'checkin'}-${hotel.id}`,
            stay: hotel,
          }}
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
          card={{ type: 'event', key: `event-${ev.id}`, event: ev, timezone }}
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
