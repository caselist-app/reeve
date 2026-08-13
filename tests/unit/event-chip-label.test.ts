import { describe, it, expect } from 'vitest'
import { eventChipTimeLabel } from '@/lib/schedule/event-chip-label'
import { toGridInstant, fromGridInstant } from '@/lib/schedule/day-window'
import { localTimeInZone, localDayWindowUtc, wallClockToUtc } from '@/lib/schedule/datetime'
import type { CalendarEvent } from '@/lib/schedule/calendar-adapter'

// REE-190: eventChipTimeLabel is the label rule EventChip applies to every
// block on the day grid, pulled out of day-calendar.tsx (which imports
// react-big-calendar and has no jsdom/CSS loader) so it can be unit-tested
// directly. See lib/schedule/event-chip-label.ts for why the live start/end
// vs. realStart/realEnd split exists (REE-187).

const TZ = 'Pacific/Auckland'
const DATE = '2026-06-14'

function atLocal(local: string): Date {
  return new Date(wallClockToUtc(`${DATE}T${local}`, TZ))
}

function baseEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const realStart = atLocal('20:00')
  const realEnd = atLocal('21:00')
  return {
    id: 'day_item:1',
    recordId: '1',
    source: 'day_item',
    title: 'Soundcheck',
    start: new Date(toGridInstant(realStart.toISOString(), TZ)),
    end: new Date(toGridInstant(realEnd.toISOString(), TZ)),
    realStart,
    realEnd,
    syntheticEnd: false,
    accent: 'other',
    icon: 'CircleDashed',
    ...overrides,
  }
}

describe('eventChipTimeLabel', () => {
  it('derives a plain event label from live start/end via fromGridInstant', () => {
    const event = baseEvent()
    const expected = `${localTimeInZone(fromGridInstant(event.start.toISOString(), TZ), TZ)}–${localTimeInZone(fromGridInstant(event.end.toISOString(), TZ), TZ)}`
    expect(eventChipTimeLabel(event, TZ)).toBe(expected)
    // Outside a drag, start/end round-trip exactly to realStart/realEnd.
    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(event.realStart.toISOString(), TZ)}–${localTimeInZone(event.realEnd.toISOString(), TZ)}`,
    )
  })

  it('tracks a live drag: the label follows start/end mid-gesture, not the stale realStart/realEnd', () => {
    const event = baseEvent()
    // RBC's drag addon updates start/end on every snapped step; realStart/
    // realEnd only update on drop, so mid-drag they diverge from the grid
    // position on screen.
    const draggedStart = atLocal('20:30')
    const draggedEnd = atLocal('21:30')
    event.start = new Date(toGridInstant(draggedStart.toISOString(), TZ))
    event.end = new Date(toGridInstant(draggedEnd.toISOString(), TZ))

    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(draggedStart.toISOString(), TZ)}–${localTimeInZone(draggedEnd.toISOString(), TZ)}`,
    )
    expect(eventChipTimeLabel(event, TZ)).not.toBe(
      `${localTimeInZone(event.realStart.toISOString(), TZ)}–${localTimeInZone(event.realEnd.toISOString(), TZ)}`,
    )
  })

  it('a continuesAfter block still reads its label from live start/end', () => {
    const event = baseEvent({ continuesAfter: true })
    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(event.realStart.toISOString(), TZ)}–${localTimeInZone(event.realEnd.toISOString(), TZ)}`,
    )
  })

  it('a continuesBefore block keeps realStart, not its clamped grid.start', () => {
    const event = baseEvent({ continuesBefore: true })
    // buildDayCalendarView clamps a continuesBefore block's grid.start to the
    // grid's top boundary, discarding what its real start would map to.
    const gridStart = new Date(localDayWindowUtc(DATE, TZ).start)
    event.start = gridStart

    const label = eventChipTimeLabel(event, TZ)
    expect(label.startsWith(localTimeInZone(event.realStart.toISOString(), TZ))).toBe(true)
    expect(label.startsWith(localTimeInZone(fromGridInstant(gridStart.toISOString(), TZ), TZ))).toBe(false)
  })

  it('a continuesBefore block ignores a live drag on its clamped start (never draggable)', () => {
    const event = baseEvent({ continuesBefore: true })
    const gridStart = new Date(localDayWindowUtc(DATE, TZ).start)
    event.start = gridStart

    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(event.realStart.toISOString(), TZ)}–${localTimeInZone(event.realEnd.toISOString(), TZ)}`,
    )
  })

  it('keeps a synthetic end start-only through a move (start and end shift by the same delta)', () => {
    const event = baseEvent({ syntheticEnd: true })
    // A move shifts start and end by the same delta, so the duration (30 min
    // in the adapter, 1h here) is unchanged and the synthesised end stays
    // unstated for the whole gesture, same as on drop (fromDropOrResize).
    const draggedStart = atLocal('20:30')
    const draggedEnd = atLocal('21:30')
    event.start = new Date(toGridInstant(draggedStart.toISOString(), TZ))
    event.end = new Date(toGridInstant(draggedEnd.toISOString(), TZ))

    expect(eventChipTimeLabel(event, TZ)).toBe(localTimeInZone(draggedStart.toISOString(), TZ))
  })

  it('REE-189: grows a synthetic end into a live range mid-resize as the bottom edge is dragged', () => {
    const event = baseEvent({ syntheticEnd: true })
    // A bottom-edge resize holds the start and drags the end, changing the
    // duration, so the drag is stating a real end live, same as it will on
    // drop: the ghost should grow into a range as the gesture happens, not
    // only once the drop lands.
    const draggedEnd = atLocal('21:45')
    event.end = new Date(toGridInstant(draggedEnd.toISOString(), TZ))

    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(event.realStart.toISOString(), TZ)}–${localTimeInZone(draggedEnd.toISOString(), TZ)}`,
    )
  })

  it('REE-189: a top-edge resize on a synthetic end also flips to a live range once the duration changes', () => {
    const event = baseEvent({ syntheticEnd: true })
    // A top-edge resize holds the end and drags the start, which changes the
    // duration exactly like a bottom-edge resize does, and fromDropOrResize
    // treats both the same way on drop: the live label mirrors that.
    const draggedStart = atLocal('20:45')
    event.start = new Date(toGridInstant(draggedStart.toISOString(), TZ))

    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(draggedStart.toISOString(), TZ)}–${localTimeInZone(event.realEnd.toISOString(), TZ)}`,
    )
  })

  it('shows a start–end range when the end is real, fed live mid-drag instants', () => {
    const event = baseEvent({ syntheticEnd: false })
    const draggedStart = atLocal('20:15')
    const draggedEnd = atLocal('22:00')
    event.start = new Date(toGridInstant(draggedStart.toISOString(), TZ))
    event.end = new Date(toGridInstant(draggedEnd.toISOString(), TZ))

    expect(eventChipTimeLabel(event, TZ)).toBe(
      `${localTimeInZone(draggedStart.toISOString(), TZ)}–${localTimeInZone(draggedEnd.toISOString(), TZ)}`,
    )
  })
})
