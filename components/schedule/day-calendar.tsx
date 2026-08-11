'use client'

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Calendar, Views, type SlotInfo } from 'react-big-calendar'
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
// The visual pass that makes the grid not look like a default RBC install
// (REE-59). Imported last, on purpose: it is unlayered CSS that must load after
// RBC's two unlayered stylesheets to win the cascade. See the header of that
// file for why a .css file is the CLAUDE.md-sanctioned exception here.
import './day-calendar.css'
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
import { fromGridInstant, toGridInstant } from '@/lib/schedule/day-window'
import { slotToDayFormInput } from '@/lib/schedule/day-form-prefill'
import { buildDayCalendarView } from '@/lib/schedule/day-calendar-view'
import { nowMarker } from '@/lib/schedule/now-marker'
import { assignOverlapDepths } from '@/lib/schedule/overlap-layout'
import { fromDropOrResize, type CalendarEvent, type EventSource } from '@/lib/schedule/calendar-adapter'
import { moveScheduleItem } from '@/lib/actions/move-schedule-item'
import type { DayRecords, DaySegment } from '@/lib/schedule/day-records'

// The drag-and-drop wrapper is built once, at module scope, around the base
// Calendar. Typed to our own event so the drop and resize callbacks carry
// CalendarEvent rather than RBC's loose base Event.
const DnDCalendar = withDragAndDrop<CalendarEvent>(Calendar)

// The id of the display-only background event that keeps the dragged range
// highlighted while the add form is open (REE-68). RBC clears its own
// slot-selection highlight the instant the drag ends, so without this the block
// the TM just drew vanishes the moment the panel appears. It is never a real
// record: it carries this sentinel id so the event chip renders nothing for it
// and eventPropGetter can give it its own selection styling.
const PENDING_SELECTION_ID = '__pending_selection__'

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

// The accent marker class per event. Source decides first: transport is teal and
// a hotel is blue wherever they appear, exactly as the old timeline had them. A
// day_item then maps its semantic accent to a hue. The colour language belongs
// to the component, not to lib/, so this returns a semantic marker class
// (.evt-*) and day-calendar.css turns it into the actual accent + tint. It is a
// marker class rather than a Tailwind utility deliberately: RBC's stylesheet is
// unlayered and would beat any Tailwind class handed to eventPropGetter, so the
// accent has to live in the same unlayered override file.
function accentClassName(source: EventSource, accent: CalendarEvent['accent']): string {
  if (source === 'segment') return 'evt-transport'
  if (source === 'hotel') return 'evt-hotel'
  switch (accent) {
    case 'show':
      return 'evt-show'
    case 'catering':
      return 'evt-catering'
    case 'headliner':
      return 'evt-headliner'
    case 'support':
      return 'evt-support'
    default:
      return 'evt-other'
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
  const { open: openSidePanel, isOpen: panelIsOpen, panel, syncScheduleItemTimes } = useSidePanel()
  const isMobile = useIsMobile()
  const [, startTransition] = useTransition()

  // The dragged range, kept alive as a highlight while its add form is open
  // (REE-68). RBC drops its native selection the moment the gesture ends; this
  // holds the range so it can be drawn as a background event underneath the
  // panel instead.
  const [pendingSelection, setPendingSelection] = useState<{ start: Date; end: Date } | null>(null)

  // The highlight belongs to the day form this drag opened. Drop it once that
  // form is closed, or once the panel has moved on to anything else (the TM
  // clicked a different block, or opened another add flow). Without this it
  // would linger after the panel that justified it has gone.
  useEffect(() => {
    if (pendingSelection && (!panelIsOpen || panel?.type !== 'day-form')) {
      setPendingSelection(null)
    }
  }, [pendingSelection, panelIsOpen, panel])

  const view = useMemo(
    () => buildDayCalendarView(records, timezone, date),
    [records, timezone, date],
  )

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
    (
      events: CalendarEvent[],
      patch: {
        id: string
        start: Date
        end: Date
        realStart: Date
        realEnd: Date
        endStated: boolean
      },
    ) =>
      events.map((event) =>
        event.id === patch.id
          ? {
              ...event,
              // Grid-space positions for RBC, real instants for the chip label,
              // both patched so a dropped block neither snaps back nor shows a
              // stale time before the revalidate lands.
              start: patch.start,
              end: patch.end,
              realStart: patch.realStart,
              realEnd: patch.realEnd,
              syntheticEnd: patch.endStated ? false : event.syntheticEnd,
            }
          : event,
      ),
  )

  // The cascade indent per event, keyed by id (REE-77). assignOverlapDepths is
  // the pure function from REE-76: it gives each block a depth one past the
  // deepest block it overlaps, and the pixel indent for that depth. The layout
  // callback and eventPropGetter both read this one map so a block's offset and
  // its "stacked" marker never disagree. Rebuilt whenever the optimistic events
  // move, so a drag that changes an overlap re-indents immediately.
  const depthById = useMemo(() => {
    const map = new Map<string, { depth: number; indentPx: number }>()
    for (const laid of assignOverlapDepths(displayEvents)) {
      map.set(laid.id, { depth: laid.depth, indentPx: laid.indentPx })
    }
    return map
  }, [displayEvents])

  // The custom day layout, replacing RBC's "no-overlap". no-overlap splits the
  // column between concurrent blocks, so titles vanish once three or four things
  // share a slot. Instead every block keeps full width and a later, overlapping
  // block steps in from the left by its indent, so both titles stay readable, the
  // later block sits on top, and the earlier block's exposed left strip is still
  // grabbable to drag or resize. top and height are left exactly as getRange
  // gives them (the real time position); only the horizontal placement changes.
  // The returned entries carry the original event object, not a copy, so RBC's
  // keys and the drag addon still recognise them. Sorted by depth so a deeper
  // block paints after (on top of) the ones it steps behind.
  const cascadeLayout = useMemo(() => {
    return ({
      events,
      slotMetrics,
      accessors,
    }: {
      events: CalendarEvent[]
      slotMetrics: { getRange: (start: Date, end: Date) => { top: number; height: number } }
      accessors: { start: (event: CalendarEvent) => Date; end: (event: CalendarEvent) => Date }
    }) => {
      return events
        .map((event) => {
          const { top, height } = slotMetrics.getRange(accessors.start(event), accessors.end(event))
          const info = depthById.get(event.id)
          const indentPx = info?.indentPx ?? 0
          return {
            event,
            depth: info?.depth ?? 0,
            style: {
              top,
              // A fixed 2px shaved off the bottom of every block (REE-109), so
              // two items that abut in time (one ending as the next begins) show
              // a clean 2px gap rather than touching. getRange returns a
              // percentage, so the gap is expressed as a calc string RBC passes
              // through verbatim: percent height minus a pixel-exact 2px, which
              // stays 2px at any grid height. top is untouched, so the gap lands
              // between the bottom of one block and the top of the next.
              height: `calc(${height}% - 2px)`,
              width: `calc(100% - ${indentPx}px)`,
              xOffset: `${indentPx}px`,
            },
          }
        })
        .sort((a, b) => a.depth - b.depth)
        .map(({ event, style }) => ({ event, style }))
    }
  }, [depthById])

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

  // The gutter reads the broadcast wall clock (04:00, 05:00, ..., 03:00), not the
  // literal calendar day the grid is bounded to (00:00..23:59). Each slot instant
  // is grid space; un-shift it back to its real instant, then format in the tour
  // zone. So the top-of-grid slot (grid 00:00) un-shifts to real 04:00 and reads
  // "04:00"; the slot three hours from the bottom un-shifts to real 01:00. The
  // block positions and this gutter share one shift, so a 01:00 curfew's chip
  // lines up with the "01:00" gutter label.
  const formats = useMemo(
    () => ({
      timeGutterFormat: (slot: Date) =>
        localTimeInZone(fromGridInstant(slot.toISOString(), date, timezone), timezone),
    }),
    [date, timezone],
  )

  // RBC positions its own red current-time hairline by feeding getNow() through
  // the same slot metrics as the blocks. The grid is synthetic, so getNow has to
  // be synthetic too: the real instant shifted onto the broadcast grid. Without
  // this, RBC would place the hairline against the real clock on a shifted grid
  // and land it hours out of place (and hide it entirely once now is past
  // midnight, which reads as a different calendar day). Recomputed per call, like
  // RBC's default getNow, so the line tracks the clock; the nowMarker label in
  // the gutter (below) is shifted the same way and sits beside it.
  const getNow = useMemo(
    () => () => new Date(toGridInstant(new Date().toISOString(), date, timezone)),
    [date, timezone],
  )

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

  // The event whose detail panel is currently open, so its block can paint as
  // selected: a solid accent fill with white text, matching the reference
  // (REE-109). Driven off the side-panel store rather than RBC's own click
  // selection so it tracks exactly what the sidebar is showing (and clears when
  // the panel closes). The panel's `key` is the CalendarEvent id we opened it
  // with, so it compares straight against event.id.
  const selectedKey =
    panelIsOpen &&
    (panel?.type === 'day-item' || panel?.type === 'transport' || panel?.type === 'hotel')
      ? panel.key
      : null

  // The dragged range as a background event, so RBC draws it behind the grid's
  // real blocks and it survives the panel being open (REE-68). Empty when there
  // is no live selection, which is the resting state. It is styled purely as a
  // highlight: the sentinel id makes the chip render nothing and gives it its
  // own class in eventPropGetter.
  const backgroundEvents = useMemo<CalendarEvent[]>(() => {
    if (!pendingSelection) return []
    return [
      {
        id: PENDING_SELECTION_ID,
        recordId: '',
        source: 'day_item',
        title: '',
        // The selection is drawn on the grid, so its start/end are already
        // grid-space slot instants; it carries no label, so realStart/realEnd
        // are unused and mirror them.
        start: pendingSelection.start,
        end: pendingSelection.end,
        realStart: pendingSelection.start,
        realEnd: pendingSelection.end,
        syntheticEnd: false,
        accent: 'other',
        icon: 'CircleDashed',
      },
    ]
  }, [pendingSelection])

  // RBC's event component. It receives the CalendarEvent the adapter produced,
  // so it reads the icon and accent that ultimately came from the kinds list. A
  // real button, so a click opens the detail panel and so the revalidate e2e can
  // find it by role. Memoised on openEvent so RBC does not remount every event.
  const components = useMemo(() => {
    function EventChip({ event }: { event: CalendarEvent }) {
      // The selection highlight is chrome, not a record: it carries no title or
      // time of its own, so it renders as a bare tinted block (REE-68).
      if (event.id === PENDING_SELECTION_ID) return null
      const Icon = eventIcon(event.icon)
      // Time range only when the end is real. A synthesised end is not a claim
      // about duration (see the adapter), so surfacing it as "10:00 to 10:30"
      // would invent a window the TM never set; the start alone is shown, which
      // already carries that the end is open. Read off realStart/realEnd, never
      // the shifted start/end: the block sits in grid space but reads its true
      // wall clock (a 01:00 curfew shows "01:00", not the 21:00 it is drawn at).
      const startLabel = localTimeInZone(event.realStart.toISOString(), timezone)
      const timeLabel = event.syntheticEnd
        ? startLabel
        : `${startLabel}–${localTimeInZone(event.realEnd.toISOString(), timezone)}`
      // Title first, then time. On a tall block the body flips to a column (the
      // @container branch in day-calendar.css) so the title sits above the time;
      // on a short block it stays this single row. The time is shrink-0 and the
      // title truncates, so the collapsed row drops title characters before it
      // ever drops the time. That ordering is load-bearing: the seeded load-in is
      // a short block and the e2e specs read its time off it.
      return (
        <button
          type="button"
          onClick={() => openEvent(event)}
          className="flex h-full w-full items-center gap-1 overflow-hidden text-left"
        >
          <Icon className="mt-px h-3 w-3 shrink-0" aria-hidden />
          <span className="evt-chip-body flex min-w-0 flex-1 flex-row items-baseline gap-1.5">
            <span className="min-w-0 truncate font-medium">{event.title}</span>
            <span className="shrink-0 tabular-nums text-[color:var(--evt-meta)]">{timeLabel}</span>
          </span>
        </button>
      )
    }

    // The red "now" label in the hour gutter, drawn next to RBC's own red
    // hairline (REE-83). RBC hands this wrapper the .rbc-time-gutter column as
    // its single child; we inject the label into it so a `position: relative`
    // gutter and a `top: %` label line up with the hairline in the day column.
    // The clock ticks every 30s. It stays null until mounted so the server
    // render and the first client render match: the marker only appears after
    // the effect runs, which never happens on the server.
    function TimeGutterWrapper({ children }: { children?: ReactNode }) {
      const [nowIso, setNowIso] = useState<string | null>(null)
      useEffect(() => {
        const tick = () => setNowIso(new Date().toISOString())
        tick()
        const id = setInterval(tick, 30_000)
        return () => clearInterval(id)
      }, [])

      const marker = nowIso ? nowMarker(nowIso, timezone, date) : null
      if (!marker || !isValidElement(children)) return children

      const gutter = children as ReactElement<{ children?: ReactNode }>
      return cloneElement(
        gutter,
        undefined,
        ...Children.toArray(gutter.props.children),
        <span key="now" className="rbc-now-label" style={{ top: `${marker.topPercent}%` }}>
          {marker.label}
        </span>,
      )
    }

    return { event: EventChip, timeGutterWrapper: TimeGutterWrapper }
  }, [openEvent, timezone, date])

  // A move (onEventDrop) and a resize (onEventResize) share one write path. The
  // difference lives entirely in fromDropOrResize: a move whose duration is
  // unchanged preserves a synthesised end as null, while a resize necessarily
  // changes the duration and so writes a real end. `endStated` mirrors that for
  // the optimistic patch, so a just-resized block does not flicker back to a
  // soft edge before the revalidate.
  function commitMove(args: EventInteractionArgs<CalendarEvent>) {
    const event = args.event
    // RBC hands back grid-space instants (the block was dragged on the synthetic
    // broadcast grid). Persistence and fromDropOrResize both work in real space,
    // so un-shift here first. The step-4 gesture work refines the boundary cases;
    // this un-shift is the minimum that keeps a drag from writing a time hours
    // off. The optimistic patch keeps the grid instants for RBC and carries the
    // real ones for the label.
    const gridStart = new Date(args.start)
    const gridEnd = new Date(args.end)
    const start = new Date(fromGridInstant(gridStart.toISOString(), date, timezone))
    const end = new Date(fromGridInstant(gridEnd.toISOString(), date, timezone))
    const target = fromDropOrResize({ event, start, end }, event)
    startTransition(async () => {
      applyOptimistic({
        id: event.id,
        start: gridStart,
        end: gridEnd,
        realStart: start,
        realEnd: end,
        endStated: target.endsAt !== null,
      })
      const result = await moveScheduleItem(tourId, target)
      // Keep a detail panel open on this same block in step with the grid: a
      // resize adds an end the panel was opened before knowing about (REE-85).
      // Only after the write succeeds, so the panel never shows a time the
      // server rejected, and keyed by event.id so it no-ops unless that record's
      // panel is the one open.
      if (!result.error) {
        syncScheduleItemTimes(event.id, target.startsAt, target.endsAt)
      }
    })
  }

  // Click-or-drag-empty-to-add. It opens Brief 42's day form with the time
  // pre-filled, snapped to 15 minutes, and the TM types the rest. A click seeds
  // just the start; a drag seeds the range it spanned, so the dragged duration
  // survives into the saved item instead of collapsing to the kind's synthesised
  // end (REE-69). Both ends carry a stated meridiem so the parser reads the exact
  // time back rather than guessing pm on a morning hour. Which day the time falls
  // on is the day being viewed; the form resolves the instant server-side like
  // every other day_item write, so nothing here derives a day.
  function handleSelectSlot(slot: SlotInfo) {
    if (!gesturesEnabled) return
    // The slot instants are grid space. The highlight is drawn on the grid, so
    // it keeps them; the form prefill is a wall-clock time the TM will read and
    // edit, so it un-shifts back to the real instant first (clicking the "01:00"
    // gutter row seeds 01:00, not the 21:00 it is drawn at).
    setPendingSelection({ start: new Date(slot.start), end: new Date(slot.end) })
    const realStart = new Date(fromGridInstant(new Date(slot.start).toISOString(), date, timezone))
    const realEnd = new Date(fromGridInstant(new Date(slot.end).toISOString(), date, timezone))
    openSidePanel({
      type: 'day-form',
      tourId,
      tourDateId,
      date,
      timezone,
      initialInput: slotToDayFormInput(realStart, realEnd, slot.action, timezone),
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
            {view.unpositioned.map((record) => {
              const Icon = eventIcon(record.icon)
              return (
                <span
                  key={`${record.source}:${record.id}`}
                  className={cn(
                    accentClassName(record.source, record.accent),
                    'inline-flex items-center gap-1.5 rounded-md bg-[var(--evt-tint)] px-2 py-1 text-xs text-[var(--evt-text)]',
                  )}
                >
                  <Icon className="h-3 w-3 shrink-0" aria-hidden />
                  {record.title}
                </span>
              )
            })}
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
          // The persisted drag highlight (REE-68). RBC renders these behind the
          // real blocks and never treats them as selectable, so they cannot be
          // dragged or clicked; they only mark where the pending add sits.
          backgroundEvents={backgroundEvents}
          date={calendarDate}
          view={Views.DAY}
          views={[Views.DAY]}
          min={min}
          max={max}
          step={15}
          timeslots={4}
          toolbar={false}
          // Broadcast-day gutter labels (04:00..03:00) and a grid-shifted now,
          // so RBC's own hairline and hour labels match the synthetic grid.
          formats={formats}
          getNow={getNow}
          components={components}
          // Overlapping items cascade: full-width blocks indented from the left
          // by depth, later ones on top, instead of RBC's side-by-side split
          // that shrinks every block to nothing once a slot gets busy (REE-77).
          dayLayoutAlgorithm={cascadeLayout}
          eventPropGetter={(event: CalendarEvent) => {
            // The pending-selection highlight gets its own class, not a kind
            // accent (REE-68): it is not one of the coloured record blocks.
            if (event.id === PENDING_SELECTION_ID) {
              return { className: 'evt-selection' }
            }
            // Stacked when it steps behind another block: a shadow lifts it off
            // the one underneath so the cascade reads as depth, not a smudge.
            const stacked = (depthById.get(event.id)?.depth ?? 0) > 0
            return {
              className: cn(
                accentClassName(event.source, event.accent),
                stacked && 'evt-stacked',
                // Its detail panel is open: fill it with the accent (REE-109).
                event.id === selectedKey && 'evt-selected',
              ),
            }
          }}
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

      {/* Outside this day: a record whose tour_date_id is this day but whose time
          falls outside the broadcast window the grid renders (e.g. a 03:00 item,
          before the 04:00 start, which belongs to the previous night's grid). RBC
          would drop it off the column silently; it is listed here instead, still
          clickable, with its real wall clock. This replaces the old "After
          midnight" tail: a past-midnight drive is now ON the grid, so the tail is
          gone and only genuinely off-window records land here. */}
      {view.outsideDay.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 pt-3 pb-4 lg:px-8">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Outside this day
          </p>
          <ul className="flex flex-col gap-1.5">
            {view.outsideDay.map((event) => {
              const Icon = eventIcon(event.icon)
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => openEvent(event)}
                    className="flex w-full items-center gap-2 text-left text-sm"
                  >
                    <span
                      className={cn(
                        accentClassName(event.source, event.accent),
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--evt-tint)] text-[var(--evt-text)]',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {localTimeInZone(event.realStart.toISOString(), timezone)}
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
