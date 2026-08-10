'use client'

import { useMemo, type ReactNode } from 'react'
import { Calendar, Views } from 'react-big-calendar'
// The grid has no layout without this: blocks will not position and the gutter
// does not render. This is the CLAUDE.md "no .css files" exception, imported
// deliberately here (Brief 43, REE-55). The visual pass that makes it not look
// like a default install is REE-59, not this step; getting a correct, ugly grid
// reviewed on its own is the point.
import 'react-big-calendar/lib/css/react-big-calendar.css'
import {
  BellRing,
  Coffee,
  DoorOpen,
  Truck,
  Cable,
  Sandwich,
  Mic,
  Star,
  Utensils,
  Users,
  Music,
  RefreshCw,
  Volume2,
  Clock,
  CircleDashed,
  Plane,
  TrainFront,
  Bus,
  Navigation,
  BedDouble,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { createZonedLocalizer } from '@/lib/schedule/calendar-localizer'
import { localTimeInZone, localDayWindowUtc } from '@/lib/schedule/datetime'
import { buildDayCalendarView } from '@/lib/schedule/day-calendar-view'
import type { CalendarEvent, EventSource } from '@/lib/schedule/calendar-adapter'
import type { DayRecords, DaySegment } from '@/lib/schedule/day-records'

interface DayCalendarProps {
  // The day's records, fetched by a Server Component and passed in. The grid
  // maps them to events here (client renders) and reuses them to open a record's
  // detail panel on click.
  records: DayRecords
  tourId: string
  // IANA name from tours.timezone, never the browser. Drives the localizer and
  // the min/max/date bounds, all rebuilt together when it changes.
  timezone: string
  // The selected day, YYYY-MM-DD. Bounds the grid to this tour-local day.
  date: string
  // The day header, rendered server-side and passed through. It is an async
  // Server Component (it queries the show/rehearsal), so it cannot be built
  // inside this client component; it rides in as a prop instead.
  header: ReactNode
}

// The kinds list names its icon as a lucide component name, and the adapter
// copies that name onto every event (a source-level default for segments and
// hotels). Resolved here through an explicit map rather than a dynamic
// lucide-react lookup, because the dynamic form pulls the entire icon set into
// this route's bundle. Every name the adapter can emit is covered; the fallback
// matches the adapter's own fallback for an unknown kind.
const EVENT_ICONS: Record<string, LucideIcon> = {
  BellRing,
  Coffee,
  DoorOpen,
  Truck,
  Cable,
  Sandwich,
  Mic,
  Star,
  Utensils,
  Users,
  Music,
  RefreshCw,
  Volume2,
  Clock,
  CircleDashed,
  Plane,
  TrainFront,
  Bus,
  Navigation,
  BedDouble,
}

function eventIcon(name: string): LucideIcon {
  return EVENT_ICONS[name] ?? CircleDashed
}

// The accent colour per event. Source decides first: transport is teal and a
// hotel is blue wherever they appear, exactly as the old timeline had them. A
// day_item then maps its semantic accent to a colour, because the colour
// language belongs to the component and not to lib/. This is REE-55's "correct
// but ugly": REE-59 owns making the grid look like anything.
function accentClassName(source: EventSource, accent: CalendarEvent['accent']): string {
  if (source === 'segment') return 'border-l-4 border-teal-500'
  if (source === 'hotel') return 'border-l-4 border-blue-500'
  switch (accent) {
    case 'show':
      return 'border-l-4 border-purple-500'
    case 'catering':
      return 'border-l-4 border-emerald-500'
    default:
      return 'border-l-4 border-amber-500'
  }
}

/**
 * The schedule day rendered as a calendar grid.
 *
 * Read only in the sense that drag, edge-resize and click-empty-to-add are off:
 * those arrive in REE-56. Clicking an event still opens its existing detail
 * panel, exactly as the old timeline card did, which is the flow a TM uses to
 * edit a time and the flow the revalidate e2e depends on.
 *
 * Server fetches, client renders: the records arrive already fetched and this
 * component maps them to events (Dates cross the boundary intact) and lays them
 * out.
 */
export function DayCalendar({ records, tourId, timezone, date, header }: DayCalendarProps) {
  const { open: openSidePanel } = useSidePanel()

  const view = useMemo(() => buildDayCalendarView(records, timezone), [records, timezone])

  // Lookups from a clicked event back to its record, so a click can open the
  // right detail panel. Segments include the late-night tail, which is
  // clickable too.
  const itemsById = useMemo(
    () => new Map(records.items.map((item) => [item.id, item])),
    [records.items],
  )
  const segmentsById = useMemo(() => {
    const map = new Map<string, DaySegment>()
    for (const seg of records.segments) map.set(seg.id, seg)
    for (const seg of records.lateNight.segments) map.set(seg.id, seg)
    return map
  }, [records.segments, records.lateNight.segments])
  const hotelsById = useMemo(
    () => new Map(records.hotels.map((hotel) => [hotel.id, hotel])),
    [records.hotels],
  )

  // The localizer renders every instant in the tour zone regardless of the
  // browser. RBC's guidance is to swap it and every Date-based prop together
  // when the zone changes, so all four are memoised on the same key.
  const localizer = useMemo(() => createZonedLocalizer(timezone), [timezone])

  const { min, max, calendarDate } = useMemo(() => {
    // The UTC instants of this tour-local day's start and end. min/max bound the
    // visible gutter to 00:00 to 24:00 in the tour zone; calendarDate picks which
    // day the single column shows. This is bounding the grid, not deriving which
    // day an event is on: RBC does that, through the zoned localizer.
    const window = localDayWindowUtc(date, timezone)
    return {
      min: new Date(window.start),
      // One millisecond before next-day midnight, so the grid ends at 23:59 and
      // does not draw an empty slot for the following midnight.
      max: new Date(new Date(window.end).getTime() - 1),
      calendarDate: new Date(window.start),
    }
  }, [date, timezone])

  const openEvent = useMemo(() => {
    return (event: CalendarEvent) => {
      if (event.source === 'day_item') {
        const item = itemsById.get(event.recordId)
        if (item) openSidePanel({ type: 'day-item', key: event.id, tourId, item, timezone })
      } else if (event.source === 'segment') {
        const segment = segmentsById.get(event.recordId)
        if (segment) openSidePanel({ type: 'transport', key: event.id, segment, timezone })
      } else {
        const stay = hotelsById.get(event.recordId)
        if (stay) openSidePanel({ type: 'hotel', key: event.id, stay })
      }
    }
  }, [itemsById, segmentsById, hotelsById, openSidePanel, tourId, timezone])

  // RBC's event component. It receives the CalendarEvent the adapter produced,
  // so it reads the icon and accent that ultimately came from the kinds list. A
  // real button, so a click opens the detail panel and so the revalidate e2e can
  // find it by role. Memoised on openEvent so RBC does not remount every event.
  const components = useMemo(() => {
    function EventChip({ event }: { event: CalendarEvent }) {
      const Icon = eventIcon(event.icon)
      return (
        <button
          type="button"
          onClick={() => openEvent(event)}
          className="flex h-full w-full items-center gap-1 overflow-hidden text-left"
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden />
          <span className="shrink-0 tabular-nums">
            {localTimeInZone(event.start.toISOString(), timezone)}
          </span>
          <span className="truncate">{event.title}</span>
        </button>
      )
    }
    return { event: EventChip }
  }, [openEvent, timezone])

  return (
    <div className="flex h-full flex-col">
      {header}

      {/* A day_items read failed. Shown whether or not anything else loaded, so
          a blank grid never stands in for "we could not read this". The grid
          below still renders any transport and hotels, which have no part in
          this error. */}
      {view.errorMessage && (
        <p className="mx-4 mb-2 rounded-lg border border-border px-3 py-2 text-xs text-destructive lg:mx-8">
          {view.errorMessage}
        </p>
      )}

      {/* The unpositioned rail. A show with no times shows every item here and an
          empty grid below, which is the normal state of a fresh day. */}
      {view.unpositioned.length > 0 && (
        <div className="shrink-0 px-4 pb-3 lg:px-8">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            No time set
          </p>
          <div className="flex flex-wrap gap-1.5">
            {view.unpositioned.map((record) => (
              <span
                key={`${record.source}:${record.id}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
              >
                {record.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* The grid. RBC renders nothing useful without an explicit height on its
          container, which is the most common first-time failure, so this box is
          flex-1 over a min-h-0 chain. */}
      <div className="min-h-0 flex-1 px-2 pb-2 lg:px-6">
        <Calendar
          localizer={localizer}
          events={view.events}
          date={calendarDate}
          view={Views.DAY}
          views={[Views.DAY]}
          min={min}
          max={max}
          step={30}
          timeslots={2}
          toolbar={false}
          components={components}
          eventPropGetter={(event: CalendarEvent) => ({
            className: accentClassName(event.source, event.accent),
          })}
          // Controlled and read only: RBC still calls these, so they are supplied
          // as no-ops rather than left to warn. Navigation and view switching are
          // off by construction (one view, fixed date); drag, resize and
          // click-empty-to-add land in REE-56.
          onNavigate={() => {}}
          onView={() => {}}
          style={{ height: '100%' }}
        />
      </div>

      {/* The late-night transport tail: a list, not grid rows. A 01:30 red-eye
          after a show is part of tonight from where the TM is standing, even
          though it is stored on tomorrow. RBC's day view has nowhere for it. */}
      {view.lateNight.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 pt-3 pb-4 lg:px-8">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            After midnight
          </p>
          <ul className="flex flex-col gap-1.5">
            {view.lateNight.map((event) => {
              const Icon = eventIcon(event.icon)
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => openEvent(event)}
                    className="flex w-full items-center gap-2 text-left text-sm"
                  >
                    <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted')}>
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {localTimeInZone(event.start.toISOString(), timezone)}
                    </span>
                    <span className="truncate">{event.title}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
