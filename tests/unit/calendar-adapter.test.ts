import { describe, it, expect } from 'vitest'
import {
  toCalendarEvents,
  fromDropOrResize,
  type CalendarEvent,
  type CalendarDayItem,
  type CalendarSegment,
  type CalendarHotel,
  type DropOrResizePayload,
} from '@/lib/schedule/calendar-adapter'

// Brief 43 step 2 (REE-53). The pure core, and the only place this brief's
// correctness can be asserted, because nothing in this repo can test a component.
//
// The invariant that ships unnoticed is first: a synthesised end must never be
// written back as a stated one. Every assertion runs under Pacific/Auckland and
// Europe/London, never UTC, because a UTC-only test passes for a fixed-offset
// implementation and says nothing about the two zones the product actually runs
// in. The day_item and segment cases are timezone-independent by construction
// (their columns are absolute instants), and asserting they are identical under
// both zones is itself the proof that this adapter converts instants and does not
// derive a day.

const ZONES = ['Pacific/Auckland', 'Europe/London'] as const

// A load-in with no end. The canonical inbound case: RBC needs an end, the row
// has none, so the adapter invents a display-only one.
function loadInNoEnd(): CalendarDayItem {
  return {
    id: 'item-load-in',
    kind: 'load_in',
    title: null,
    starts_at: '2026-06-14T09:00:00.000Z',
    ends_at: null,
  }
}

// A soundcheck with a stated 90 minute end. The control: a real end must survive
// both functions untouched.
function soundcheck90(): CalendarDayItem {
  return {
    id: 'item-soundcheck',
    kind: 'soundcheck',
    title: null,
    starts_at: '2026-06-14T15:00:00.000Z',
    ends_at: '2026-06-14T16:30:00.000Z',
  }
}

const EMPTY: {
  items: CalendarDayItem[]
  segments: CalendarSegment[]
  hotels: CalendarHotel[]
} = { items: [], segments: [], hotels: [] }

for (const timezone of ZONES) {
  describe(`calendar-adapter (${timezone})`, () => {
    // 1. A day_item with a null ends_at becomes an event with a synthesised end
    //    and syntheticEnd: true.
    it('synthesises an end for a day_item with no ends_at', () => {
      const { events } = toCalendarEvents({ ...EMPTY, items: [loadInNoEnd()] }, { timezone })

      expect(events).toHaveLength(1)
      const event = events[0]
      expect(event.syntheticEnd).toBe(true)
      expect(event.start.toISOString()).toBe('2026-06-14T09:00:00.000Z')
      // The end exists and is strictly after the start, so it can be drawn.
      expect(event.end.getTime()).toBeGreaterThan(event.start.getTime())
    })

    // 2. THE ASSERTION THAT PROTECTS THE DATA. A pure move of that event returns
    //    endsAt: null, not the synthesised value.
    it('preserves the null end on a pure move', () => {
      const { events } = toCalendarEvents({ ...EMPTY, items: [loadInNoEnd()] }, { timezone })
      const original = events[0]

      // A move shifts start and end by the same delta: RBC preserves duration.
      const deltaMs = 2 * 60 * 60 * 1000 // two hours later
      const moved: DropOrResizePayload = {
        event: original,
        start: new Date(original.start.getTime() + deltaMs),
        end: new Date(original.end.getTime() + deltaMs),
      }

      const persist = fromDropOrResize(moved, original)
      expect(persist.endsAt).toBeNull()
      expect(persist.startsAt).toBe('2026-06-14T11:00:00.000Z')
      expect(persist.source).toBe('day_item')
      expect(persist.id).toBe('item-load-in')
    })

    // 3. A resize of that same event returns the new endsAt, strictly greater
    //    than startsAt so the check constraint cannot reject it.
    it('writes a real end on a resize of a synthesised block', () => {
      const { events } = toCalendarEvents({ ...EMPTY, items: [loadInNoEnd()] }, { timezone })
      const original = events[0]

      // A resize keeps the start and changes the end: the duration changes.
      const resized: DropOrResizePayload = {
        event: original,
        start: original.start,
        end: new Date(original.start.getTime() + 3 * 60 * 60 * 1000),
      }

      const persist = fromDropOrResize(resized, original)
      expect(persist.endsAt).toBe('2026-06-14T12:00:00.000Z')
      expect(new Date(persist.endsAt as string).getTime()).toBeGreaterThan(
        new Date(persist.startsAt).getTime(),
      )
    })

    // 4. A day_item with a stated 90 minute end round-trips unchanged through
    //    both functions.
    it('round-trips a stated end unchanged', () => {
      const { events } = toCalendarEvents({ ...EMPTY, items: [soundcheck90()] }, { timezone })
      const original = events[0]
      expect(original.syntheticEnd).toBe(false)
      expect(original.start.toISOString()).toBe('2026-06-14T15:00:00.000Z')
      expect(original.end.toISOString()).toBe('2026-06-14T16:30:00.000Z')

      // A no-op move (delta zero) must return exactly the stored instants.
      const noop: DropOrResizePayload = {
        event: original,
        start: original.start,
        end: original.end,
      }
      const persist = fromDropOrResize(noop, original)
      expect(persist.startsAt).toBe('2026-06-14T15:00:00.000Z')
      expect(persist.endsAt).toBe('2026-06-14T16:30:00.000Z')

      // And a real move keeps the 90 minute end: a stated end is never nulled.
      const deltaMs = 60 * 60 * 1000
      const moved: DropOrResizePayload = {
        event: original,
        start: new Date(original.start.getTime() + deltaMs),
        end: new Date(original.end.getTime() + deltaMs),
      }
      const movedPersist = fromDropOrResize(moved, original)
      expect(movedPersist.endsAt).toBe('2026-06-14T17:30:00.000Z')
    })

    // 5. A hotel check-out, which is check_out_date plus check_out_time and can
    //    never have an end, always yields syntheticEnd: true.
    it('always synthesises the end of a hotel check-out', () => {
      const hotel: CalendarHotel = {
        id: 'hotel-1',
        name: 'The Standard',
        check_in_date: '2026-06-13',
        check_in_time: '15:00',
        check_out_date: '2026-06-14',
        check_out_time: '11:00',
        isCheckout: true,
      }

      const { events } = toCalendarEvents({ ...EMPTY, hotels: [hotel] }, { timezone })
      expect(events).toHaveLength(1)
      expect(events[0].source).toBe('hotel')
      expect(events[0].syntheticEnd).toBe(true)
      // A move of a check-out must not invent a stated end either.
      const original = events[0]
      const moved: DropOrResizePayload = {
        event: original,
        start: new Date(original.start.getTime() + 30 * 60 * 1000),
        end: new Date(original.end.getTime() + 30 * 60 * 1000),
      }
      expect(fromDropOrResize(moved, original).endsAt).toBeNull()
    })

    // 6. A transport segment maps with source: 'segment' and carries its
    //    depart_at as the start.
    it('maps a transport segment from its depart_at', () => {
      const segment: CalendarSegment = {
        id: 'seg-1',
        mode: 'flight',
        origin: 'London',
        destination: 'Paris',
        depart_at: '2026-06-14T07:30:00.000Z',
        arrive_at: '2026-06-14T09:00:00.000Z',
      }

      const { events } = toCalendarEvents({ ...EMPTY, segments: [segment] }, { timezone })
      expect(events).toHaveLength(1)
      expect(events[0].source).toBe('segment')
      expect(events[0].start.toISOString()).toBe('2026-06-14T07:30:00.000Z')
      // Its arrival is a stated end, so it is not synthesised.
      expect(events[0].syntheticEnd).toBe(false)
      expect(events[0].end.toISOString()).toBe('2026-06-14T09:00:00.000Z')
    })

    // 7. An item with a null starts_at is returned in a separate unpositioned
    //    array and produces no event.
    it('returns an unstarted day_item as unpositioned, not an event', () => {
      const item: CalendarDayItem = {
        id: 'item-untimed',
        kind: 'load_in',
        title: null,
        starts_at: null,
        ends_at: null,
      }

      const { events, unpositioned } = toCalendarEvents(
        { ...EMPTY, items: [item] },
        { timezone },
      )
      expect(events).toHaveLength(0)
      expect(unpositioned).toHaveLength(1)
      expect(unpositioned[0]).toMatchObject({ source: 'day_item', id: 'item-untimed' })
    })
  })
}

// 8 is satisfied by the loop above: every assertion runs under both zones. This
// final block states the property the loop only implies: a day_item event is
// byte-for-byte the same under Auckland and London, because its columns are
// absolute instants and this adapter never derives a day from them. If someone
// later reaches for a day-deriving shortcut here, this is what catches it.
describe('calendar-adapter: instants do not depend on the tour zone', () => {
  it('produces identical day_item events under Auckland and London', () => {
    const auckland = toCalendarEvents({ ...EMPTY, items: [loadInNoEnd()] }, {
      timezone: 'Pacific/Auckland',
    }).events[0]
    const london = toCalendarEvents({ ...EMPTY, items: [loadInNoEnd()] }, {
      timezone: 'Europe/London',
    }).events[0]

    expect(auckland.start.toISOString()).toBe(london.start.toISOString())
    expect(auckland.end.toISOString()).toBe(london.end.toISOString())
    expect(auckland.syntheticEnd).toBe(london.syntheticEnd)
  })
})

// A stated-end move must survive even when the drag lands across a DST boundary,
// because the adapter works in absolute milliseconds and leaves the day to the
// server. This is the one place the two functions meet a zone edge, so it is
// worth pinning: the returned end is exactly start-plus-duration in UTC, whatever
// London's clocks did in between.
describe('calendar-adapter: a move is millisecond arithmetic, not wall clock', () => {
  it('shifts a stated end by the real delta across a spring-forward', () => {
    const item: CalendarDayItem = {
      id: 'item-dst',
      kind: 'soundcheck',
      title: null,
      // 00:30Z on London's spring-forward morning, a stated 60 minute block.
      starts_at: '2026-03-29T00:30:00.000Z',
      ends_at: '2026-03-29T01:30:00.000Z',
    }
    const original: CalendarEvent = toCalendarEvents(
      { ...EMPTY, items: [item] },
      { timezone: 'Europe/London' },
    ).events[0]

    const deltaMs = 60 * 60 * 1000
    const moved: DropOrResizePayload = {
      event: original,
      start: new Date(original.start.getTime() + deltaMs),
      end: new Date(original.end.getTime() + deltaMs),
    }
    const persist = fromDropOrResize(moved, original)
    expect(persist.startsAt).toBe('2026-03-29T01:30:00.000Z')
    expect(persist.endsAt).toBe('2026-03-29T02:30:00.000Z')
  })
})
