'use client'

import { useMemo, useOptimistic, useTransition, type ReactNode } from 'react'
import { Calendar, Views } from 'react-big-calendar'
import withDragAndDrop, {
  type EventInteractionArgs,
} from 'react-big-calendar/lib/addons/dragAndDrop'
// The grid has no layout without this: blocks will not position and the gutter
// does not render. The drag addon ships a second stylesheet on top of it. Both
// are the CLAUDE.md "no .css files" exception, imported deliberately here (Brief
// 43). The visual pass that makes it not look like a default install is REE-59;
// getting a correct grid with the gestures working, reviewed on its own, is the
// point of this step.
import 'react-big-calendar/lib/css/react-big-calendar.css'
import 'react-big-calendar/lib/addons/dragAndDrop/styles.css'
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
import { useIsMobile } from '@/hooks/use-is-mobile'
import { createZonedLocalizer } from '@/lib/schedule/calendar-localizer'
import { localTimeInZone, localDayWindowUtc } from '@/lib/schedule/datetime'
import { buildDayCalendarView } from '@/lib/schedule/day-calendar-view'
import { fromDropOrResize, type CalendarEvent, type EventSource } from '@/lib/schedule/calendar-adapter'
import { moveScheduleItem } from '@/lib/actions/move-schedule-item'
import type { DayRecords, DaySegment } from '@/lib/schedule/day-records'

// The drag-and-drop wrapper is built once, at module scope, around the base
// Calendar. Typed to our own event so the drop and resize callbacks carry
// CalendarEvent rather than RBC's loose base Event.
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

interface DayCalendarProps {
  // The day's records, fetched by a Server Component and passed in. The grid
  // maps them to events here (client renders) and reuses them to open a record's
  // detail panel on click.
  records: DayRecords
  tourId: string
  // The day being viewed. Present because the calendar only renders for a real
  // tour date, and click-empty-to-add opens the day form against it.
  tourDateId: string
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
 * Drag to move, drag an edge to resize, and click empty space to add (REE-56),
 * all desktop only: RBC's drag addon is mouse-oriented and mobile drag is out of
 * scope for this brief. Clicking an event still opens its existing detail panel.
 *
 * Two containment rules run through every gesture. Nothing here asks RBC or
 * Luxon which day the dropped item lands on: the callback proposes an instant and
 * moveScheduleItem derives the day server-side, which is what makes RBC's weak
 * timezone story survivable. And a drop is never handed to the action raw: it
 * goes through fromDropOrResize first, so the fake end the adapter invented is
 * not written as a stated one on a move the TM thinks is only a move.
 *
 * Server fetches, client renders: the records arrive already fetched and this
 * component maps them to events (Dates cross the boundary intact) and lays them
 * out.
 */
export function DayCalendar({ records, tourId, tourDateId, timezone, date, header }: DayCalendarProps) {
  const { open: openSidePanel } = useSidePanel()
  const isMobile = useIsMobile()
  const [, startTransition] = useTransition()

  const view = useMemo(() => buildDayCalendarView(records, timezone), [records, timezone])

  // The gesture is desktop only. On mobile the grid still renders and events
  // still open their panels; only drag, resize and click-to-add are off.
  const gesturesEnabled = !isMobile

  // Optimistic positions, so a dropped block lands at its new time immediately
  // and does not snap back to the server's old position and then forward again
  // once the revalidate lands. The base is the server-derived events; when the
  // action revalidates, `view.events` updates and this rebases onto it. A move
  // that errors never revalidates, so the base is unchanged and the optimistic
  // position falls away on its own when the transition ends.
  const [displayEvents, applyOptimistic] = useOptimistic(
    view.events,
    (events: CalendarEvent[], patch: { id: string; start: Date; end: Date; endStated: boolean }) =>
      events.map((event) =>
        event.id === patch.id
          ? { ...event, start: patch.start, end: patch.end, syntheticEnd: patch.endStated ? false : event.syntheticEnd }
          : event,
      ),
  )

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

  // A move (onEventDrop) and a resize (onEventResize) share one write path. The
  // difference lives entirely in fromDropOrResize: a move whose duration is
  // unchanged preserves a synthesised end as null, while a resize necessarily
  // changes the duration and so writes a real end. `endStated` mirrors that for
  // the optimistic patch, so a just-resized block does not flicker back to a
  // soft edge before the revalidate.
  function commitMove(args: EventInteractionArgs<CalendarEvent>) {
    const event = args.event
    const start = new Date(args.start)
    const end = new Date(args.end)
    const target = fromDropOrResize({ event, start, end }, event)
    startTransition(async () => {
      applyOptimistic({ id: event.id, start, end, endStated: target.endsAt !== null })
      await moveScheduleItem(tourId, target)
    })
  }

  // Click-empty-to-add. The click is a shortcut for typing the time, nothing
  // more: it opens Brief 42's day form with the time pre-filled, snapped to 15
  // minutes, and the TM types the rest. Which day the time falls on is the day
  // being viewed; the form resolves the instant server-side like every other
  // day_item write, so nothing here derives a day.
  function handleSelectSlot(slot: { start: Date | string }) {
    if (!gesturesEnabled) return
    const fifteenMin = 15 * 60 * 1000
    // Snapping the instant is snapping the wall clock: every timezone this
    // product cares about is a whole number of 15-minute steps off UTC.
    const snapped = new Date(Math.round(new Date(slot.start).getTime() / fifteenMin) * fifteenMin)
    openSidePanel({
      type: 'day-form',
      tourId,
      tourDateId,
      initialInput: localTimeInZone(snapped.toISOString(), timezone),
    })
  }

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
        <DnDCalendar
          localizer={localizer}
          events={displayEvents}
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
          // Desktop only. RBC's drag addon is mouse-oriented; on mobile every
          // gesture is off and the grid is display plus tap-to-open.
          draggableAccessor={() => gesturesEnabled}
          resizable={gesturesEnabled}
          // 'ignoreEvents', not true: a click that lands on an event opens that
          // event's panel and must not also fire onSelectSlot underneath it,
          // which would open the add form at the same time.
          selectable={gesturesEnabled ? 'ignoreEvents' : false}
          onEventDrop={commitMove}
          onEventResize={commitMove}
          onSelectSlot={handleSelectSlot}
          // Controlled: RBC still calls these, so they are supplied as no-ops
          // rather than left to warn. Navigation and view switching are off by
          // construction (one view, fixed date).
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
