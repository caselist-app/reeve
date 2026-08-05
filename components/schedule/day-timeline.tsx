import { TimelineCard } from '@/components/schedule/timeline-card'
import { DayHeader } from '@/components/schedule/day-header'
import { formatFlightNumber } from '@/lib/utils/format-flight-number'
import { placeName } from '@/lib/utils/place-name'
import { dayItemKind, dayItemLabel } from '@/lib/schedule/day-item-kinds'
import type { DayRecords, DaySegment } from '@/lib/schedule/day-records'

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

// ---- Day items --------------------------------------------------------------

// DAY_SHEET_FIELDS used to live here: fourteen field names and fourteen labels,
// one of twelve places that had to agree about what can be on a day. It is gone.
// The kind list is the only list now, and this file reads labels off it.
//
// The accent is the one thing that stays here, because the timeline's colour
// language belongs to the timeline: purple is the show, teal is travel, blue is
// a hotel. The kind list stores the semantic value ('show', 'catering', 'other')
// and this maps it, so a kind cannot smuggle a Tailwind class into lib/.
//
// Catering is emerald because the other four are taken and it is genuinely a
// fifth kind of thing. It is also the one accent that renders something new:
// catering times existed only inside the show panel before, and now that they
// are items they appear in the running order like everything else.
const ITEM_ACCENTS: Record<string, string> = {
  show: 'border-purple-500',
  catering: 'border-emerald-500',
  other: 'border-amber-500',
}

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
  const { shows, items: dayItems, itemsError, segments, hotels, lateNight } = records

  // The venue name is the fallback title for a show's own items, so a load-in
  // reads "Load-in / O2 Academy Brixton" exactly as it did when it was a column.
  // A day holds at most one show, so the first is the one.
  const venueName = shows[0]?.venue_name ?? null

  // Build a flat list of timeline items with a sort key.
  type TimelineItem = {
    key: string
    sortKey: string
    node: React.ReactNode
  }

  const items: TimelineItem[] = []

  // Day items: everything that used to be a day-sheet column or a day event.
  //
  // The placeholder card a show with no times used to get is gone. Its stated
  // reason (Brief 36 step 4) was that "nothing else on the day view linked to
  // it", and that stopped being true in the same brief's step 6, which put the
  // venue block in day info. A show with an empty running order is now reached
  // there, which is also where its advance, catering and delete live.
  for (const item of dayItems) {
    const kind = dayItemKind(item.kind)
    // An unknown kind means the database and the kind list have come apart. The
    // label falls back to the raw kind, which is deliberately ugly on screen,
    // and the accent falls back to the neutral one. Rendering it as a custom
    // item would hide the drift.
    const accent = kind ? ITEM_ACCENTS[kind.accent] : ITEM_ACCENTS.other

    // The end is shown whenever one exists, on any kind. surfaceEndInComms is
    // about WhatsApp, where a range reads badly for everything except a meal;
    // on screen a stated end is information the TM typed and wants back.
    const endText = item.ends_at ? `to ${formatTime(item.ends_at, timezone)}` : null
    const subtitle = [endText, item.location].filter(Boolean).join(' · ')

    items.push({
      key: `day-item-${item.id}`,
      sortKey: sortKey(item.starts_at, date),
      node: (
        <TimelineCard
          key={`day-item-${item.id}`}
          time={formatTime(item.starts_at, timezone)}
          label={dayItemLabel(item.kind)}
          // A title is an optional qualifier on any kind, so a soundcheck titled
          // Tesseract reads as itself and an untitled load-in still reads as the
          // venue, exactly as it did as a column.
          title={item.title ?? venueName ?? dayItemLabel(item.kind)}
          subtitle={subtitle || undefined}
          accent={accent}
          card={{
            type: 'day-item',
            key: `day-item-${item.id}`,
            tourId,
            item,
            timezone,
          }}
        />
      ),
    })
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

  // Extracted rather than inlined in the loop because the late-night tail below
  // renders the same cards for records belonging to the next morning. Two copies
  // of this would drift, and the flight-specific branches are where it would
  // show first.
  function segmentItem(seg: DaySegment): TimelineItem {
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
    return {
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
    }
  }

  for (const seg of segments) items.push(segmentItem(seg))

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

  // Sort by time ascending.
  items.sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  // The tail: transport belonging to the small hours of the next morning. A tour
  // day is a working period rather than a calendar day, so a 01:30 red-eye
  // after a show is part of tonight from where the TM is standing, even though
  // it is stored on tomorrow and still renders there too.
  //
  // Day items are not in here any more, and that is the brief's structural win
  // rather than an omission. A curfew a TM sets on the 14th already has
  // tour_date_id pointing at the 14th, so it arrives in `items` above and sorts
  // into the running order in its right place. See lib/schedule/day-records.ts.
  //
  // Sorted and rendered separately rather than merged into `items`, so it can
  // never reorder the day itself. Whatever this section gets right or wrong, the
  // running order above it is unchanged.
  const tailItems = lateNight.segments
    .map(segmentItem)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))

  const tail = tailItems.length > 0 && (
    <div className="mt-2 border-t border-border pt-4">
      <p className="px-6 pb-2 text-xs font-medium text-muted-foreground">
        After midnight
      </p>
      {tailItems.map((item) => item.node)}
    </div>
  )

  if (items.length === 0 && tailItems.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {header}
        <div className="flex-1 flex items-center justify-center px-6">
          {/* A failed read is not an empty day. "Nothing added to this day yet"
              is a confident, plausible, wrong answer, and a TM who believes it
              and starts retyping a running order has been told a lie by the
              product. This is the same rule the crew-facing templates follow. */}
          <p className="text-sm text-muted-foreground text-center">
            {itemsError
              ? 'Could not load this day. Refresh to try again.'
              : 'Nothing added to this day yet.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {header}
      <div className="flex-1 overflow-y-auto py-4">
        {/* The half of the failed-read rule that is easy to miss. A day with a
            flight on it still renders when the items query fails, so the empty
            state above never fires and the TM sees a running order with every
            time missing and nothing saying so. That reads as a day with no
            load-in, which is a thing they would act on. */}
        {itemsError && (
          <p className="mx-6 mb-3 rounded-lg border border-border px-3 py-2 text-xs text-destructive">
            Could not load this day&apos;s times. What is below is incomplete.
          </p>
        )}
        {items.map((item) => item.node)}
        {tail}
      </div>
    </div>
  )
}
