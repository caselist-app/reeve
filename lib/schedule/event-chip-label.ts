// REE-190: the label rule EventChip (day-calendar.tsx) applies to every block,
// pulled out so a Node test can reach it. day-calendar.tsx imports
// react-big-calendar and its stylesheet, which have no jsdom/CSS loader, so
// nothing inside that file is unit-testable directly: the same reason
// calendar-adapter.ts and day-calendar-view.ts are their own modules.
//
// REE-187 made the label track a live drag/resize: it reads event.start/end
// (which RBC's drag addon updates on every snapped step) through
// fromGridInstant, rather than realStart/realEnd, which only update on drop.
// Outside a drag this round-trips exactly to realStart/realEnd, since
// buildDayCalendarView set start/end via toGridInstant from those same
// instants. The one exception is a continuesBefore block: its grid.start is
// clamped to the grid's top boundary (a read-only projection of a row filed on
// the previous day), so deriving its start from event.start would show the
// 04:00 boundary instead of the real start. Those blocks are never draggable
// (draggableAccessor excludes continuesBefore in day-calendar.tsx), so
// realStart is always correct for them and never goes stale. The end is never
// clamped this way, so it always reads through fromGridInstant(event.end).
//
// REE-189: a synthetic end does not stay a start-only label for the whole
// gesture. commitMove's endStated (day-calendar.tsx) only flips
// event.syntheticEnd on drop, via fromDropOrResize's own rule: a move shifts
// start and end by the same delta, so the duration is unchanged and a
// synthesised end stays unstated, while a resize that changes the duration is
// the TM stating one. Mid-gesture, event.syntheticEnd is still whatever it
// was before the drag started, so mirroring that same duration comparison
// here, live, is what makes a bottom-edge resize grow into a "start–end"
// range as it happens rather than only on drop, while a plain move (duration
// unchanged) keeps showing the start alone. event.realStart/realEnd hold the
// pre-gesture instants (they only update on drop too), so they are the stable
// "was this a move" baseline to compare the live instants against.
import { localTimeInZone } from '@/lib/schedule/datetime'
import { fromGridInstant } from '@/lib/schedule/day-window'
import type { CalendarEvent } from '@/lib/schedule/calendar-adapter'

/**
 * The time label an EventChip shows: a single start-only label when the end is
 * still synthetic, a "start–end" range otherwise (see the adapter's
 * SYNTHETIC_END_MS). Reads live event.start/end so the label tracks a drag or
 * resize gesture in progress, including a synthetic end growing into a live
 * range mid-resize, except for a continuesBefore block, which keeps its real
 * start.
 */
export function eventChipTimeLabel(event: CalendarEvent, timezone: string): string {
  const liveStartIso = event.continuesBefore
    ? event.realStart.toISOString()
    : fromGridInstant(event.start.toISOString(), timezone)
  const liveEndIso = fromGridInstant(event.end.toISOString(), timezone)
  const startLabel = localTimeInZone(liveStartIso, timezone)

  const originalDurationMs = event.realEnd.getTime() - event.realStart.getTime()
  const liveDurationMs = new Date(liveEndIso).getTime() - new Date(liveStartIso).getTime()
  const endStillSynthetic = event.syntheticEnd && liveDurationMs === originalDurationMs
  if (endStillSynthetic) return startLabel

  const endLabel = localTimeInZone(liveEndIso, timezone)
  return `${startLabel}–${endLabel}`
}
