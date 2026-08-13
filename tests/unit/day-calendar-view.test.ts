import { describe, it, expect } from 'vitest'
import { buildDayCalendarView } from '@/lib/schedule/day-calendar-view'
import { assignOverlapDepths } from '@/lib/schedule/overlap-layout'
import {
  wallClockToUtc,
  localDayWindowUtc,
  localTimeInZone,
  addDays,
} from '@/lib/schedule/datetime'
import type { DayItem } from '@/lib/schedule/day-items'
import type { DayRecords, DaySegment } from '@/lib/schedule/day-records'

// Broadcast-day grid, step 3 (REE-114). buildDayCalendarView is the pure seam a
// test can reach (no component in this repo renders), and this is where the shift
// is asserted: a night that spans midnight is one continuous column, and a record
// whose time falls outside the broadcast window is set aside rather than dropped.
//
// Every case runs in three zones. A tour on UTC is the readable baseline; Auckland
// (UTC+12 in June) is already the next calendar date by evening, so a 01:00 curfew
// is a different UTC day AND a different tour-local day from the show it ends; Los
// Angeles (UTC-7) is west of UTC. The shift is DAY_START_HOUR hours in all three
// on a non-DST day, so the same wall-clock night lands identically, which is the
// proof the view converts instants and does not derive a day. Instants are built
// from wall-clock local times via wallClockToUtc so "21:00 local" is 21:00 local
// in whichever zone the case runs.

const DATE = '2026-06-14'
const NEXT = addDays(DATE, 1)
const ZONES = ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']

function emptyRecords(): DayRecords {
  return {
    shows: [],
    items: [],
    itemsError: null,
    segments: [],
    hotels: [],
    continuedFromPrev: { items: [], segments: [] },
    segmentIds: [],
    hotelStayIds: [],
    emptyPartySegmentIds: [],
    emptyPartyHotelIds: [],
  }
}

// A day_item at a wall-clock local time. Only the adapter-read fields carry data;
// the rest are the nulls a real row would have when unset. `local` is
// `YYYY-MM-DDTHH:MM`, read in `tz`.
function itemAt(id: string, kind: string, local: string, tz: string): DayItem {
  return {
    id,
    tour_id: 'tour-1',
    tour_date_id: 'tdid-1',
    show_id: 'show-1',
    kind,
    title: null,
    starts_at: wallClockToUtc(local, tz),
    ends_at: null,
    location: null,
    notes: null,
  }
}

// An overnight drive departing at a wall-clock local time, no arrival stated.
function driveAt(id: string, local: string, tz: string): DaySegment {
  return {
    id,
    mode: 'ground',
    origin: 'Venue',
    destination: 'Hotel',
    depart_at: wallClockToUtc(local, tz),
    arrive_at: null,
    carrier_operator: null,
    vehicle_or_flight_no: null,
    booking_reference: null,
    status: 'planned',
    origin_iata: null,
    destination_iata: null,
    flight_status: null,
    actual_depart_at: null,
    actual_arrive_at: null,
    gate: null,
    terminal: null,
    last_tracked_at: null,
  }
}

// A drive that spans, with a stated arrival: only a stated end can break over
// the boundary. `departLocal`/`arriveLocal` are `YYYY-MM-DDTHH:MM`, read in tz.
function overnightDrive(
  id: string,
  departLocal: string,
  arriveLocal: string,
  tz: string,
): DaySegment {
  return { ...driveAt(id, departLocal, tz), arrive_at: wallClockToUtc(arriveLocal, tz) }
}

// A day_item with a stated end, so it too can break over the boundary.
function itemSpan(
  id: string,
  kind: string,
  startLocal: string,
  endLocal: string,
  tz: string,
): DayItem {
  return { ...itemAt(id, kind, startLocal, tz), ends_at: wallClockToUtc(endLocal, tz) }
}

for (const tz of ZONES) {
  describe(`broadcast-day grid view (${tz})`, () => {
    const gridStart = new Date(localDayWindowUtc(DATE, tz).start).getTime()
    const gridEnd = new Date(localDayWindowUtc(DATE, tz).end).getTime()

    it('places a 10:00->02:00 night on one continuous column with real labels', () => {
      // A full working night: a mid-morning load-in, an evening show, a curfew in
      // the small hours of the next calendar date, and an overnight drive after
      // it. The last two fall on NEXT in real time; on the broadcast grid they
      // belong to DATE's night.
      const records: DayRecords = {
        ...emptyRecords(),
        items: [
          itemAt('load-in', 'load_in', `${DATE}T10:00`, tz),
          itemAt('show', 'headliner', `${DATE}T21:00`, tz),
          itemAt('curfew', 'curfew', `${NEXT}T01:00`, tz),
        ],
        segments: [driveAt('drive', `${NEXT}T02:00`, tz)],
      }

      const view = buildDayCalendarView(records, tz, DATE)

      // All four are positioned on the grid; nothing is set aside or dropped.
      expect(view.events).toHaveLength(4)
      expect(view.unpositioned).toHaveLength(0)
      expect(view.outsideDay).toHaveLength(0)

      // Every shifted start sits inside the grid's calendar day, curfew and drive
      // included: that is the whole point of the shift.
      for (const event of view.events) {
        const startMs = event.start.getTime()
        expect(startMs).toBeGreaterThanOrEqual(gridStart)
        expect(startMs).toBeLessThan(gridEnd)
      }

      const byId = new Map(view.events.map((e) => [e.recordId, e]))

      // The synthetic top of each block is its real instant shifted back by the
      // 04:00 day-start, so ordering is preserved and the curfew sits below the
      // show, not above tomorrow. Asserted as the shifted wall clock: 10:00 ->
      // 06:00, 21:00 -> 17:00, 01:00 -> 21:00, 02:00 -> 22:00.
      expect(localTimeInZone(byId.get('load-in')!.start.toISOString(), tz)).toBe('06:00')
      expect(localTimeInZone(byId.get('show')!.start.toISOString(), tz)).toBe('17:00')
      expect(localTimeInZone(byId.get('curfew')!.start.toISOString(), tz)).toBe('21:00')
      expect(localTimeInZone(byId.get('drive')!.start.toISOString(), tz)).toBe('22:00')

      // The labels stay the real wall clock: a curfew reads 01:00, not the 21:00
      // it is drawn at.
      expect(localTimeInZone(byId.get('load-in')!.realStart.toISOString(), tz)).toBe('10:00')
      expect(localTimeInZone(byId.get('show')!.realStart.toISOString(), tz)).toBe('21:00')
      expect(localTimeInZone(byId.get('curfew')!.realStart.toISOString(), tz)).toBe('01:00')
      expect(localTimeInZone(byId.get('drive')!.realStart.toISOString(), tz)).toBe('02:00')
    })

    it('sets aside an item before the 04:00 start rather than dropping it', () => {
      // 03:00 on DATE is before the broadcast start, so it belongs to the
      // PREVIOUS night's grid, not this one. Its tour_date_id is still this day
      // (a TM filed it here), so the never-drop rule lists it in "Outside this
      // day" rather than letting RBC filter it off the column silently.
      const records: DayRecords = {
        ...emptyRecords(),
        items: [itemAt('pre-dawn', 'lobby_call', `${DATE}T03:00`, tz)],
      }

      const view = buildDayCalendarView(records, tz, DATE)

      expect(view.events).toHaveLength(0)
      expect(view.outsideDay).toHaveLength(1)
      expect(view.outsideDay[0].recordId).toBe('pre-dawn')
      // It keeps its real wall-clock time for the rail label.
      expect(localTimeInZone(view.outsideDay[0].realStart.toISOString(), tz)).toBe('03:00')
      // And its shifted start really is off the top of the grid, which is why it
      // could not be placed.
      expect(view.outsideDay[0].start.getTime()).toBeLessThan(gridStart)
    })

    it('keeps the broadcast-start item on the grid, not in the rail', () => {
      // 04:00 exactly is grid midnight: the first placeable slot of the night.
      // The boundary is half-open [04:00, +1 04:00), so this is IN, and a 04:00
      // next-day item (the far boundary) is OUT.
      const records: DayRecords = {
        ...emptyRecords(),
        items: [
          itemAt('at-start', 'lobby_call', `${DATE}T04:00`, tz),
          itemAt('at-end', 'lobby_call', `${NEXT}T04:00`, tz),
        ],
      }

      const view = buildDayCalendarView(records, tz, DATE)

      const onGrid = view.events.map((e) => e.recordId)
      const railed = view.outsideDay.map((e) => e.recordId)
      expect(onGrid).toContain('at-start')
      expect(railed).toContain('at-end')
      expect(localTimeInZone(view.events[0].start.toISOString(), tz)).toBe('00:00')
    })

    it('tags a block that runs past the grid bottom as continuesAfter (REE-124)', () => {
      // An overnight drive after tonight's show: departs 22:00 on DATE, arrives
      // 07:00 the next morning, past the 04:00 boundary. On DATE's grid it is
      // positioned but breaks over the bottom, so it is tagged continuesAfter and
      // will also draw on NEXT's grid.
      const records: DayRecords = {
        ...emptyRecords(),
        segments: [overnightDrive('drive', `${DATE}T22:00`, `${NEXT}T07:00`, tz)],
      }

      const view = buildDayCalendarView(records, tz, DATE)

      expect(view.events).toHaveLength(1)
      const drive = view.events[0]
      expect(drive.recordId).toBe('drive')
      expect(drive.continuesAfter).toBe(true)
      expect(drive.continuesBefore).toBeFalsy()
      // Positioned by its real start: 22:00 shifted back four hours is 18:00, and
      // that sits inside DATE's grid window.
      expect(localTimeInZone(drive.start.toISOString(), tz)).toBe('18:00')
      expect(drive.start.getTime()).toBeGreaterThanOrEqual(gridStart)
      expect(drive.start.getTime()).toBeLessThan(gridEnd)
      // Its shifted end really does run past the grid bottom, which is why it
      // continues: 07:00 -> 03:00 on NEXT, past NEXT 00:00 (this grid's end).
      expect(drive.end.getTime()).toBeGreaterThan(gridEnd)
    })

    it('projects a previous-day block onto this grid clamped to the top, continuesBefore (REE-124)', () => {
      // The same overnight drive, now viewed on NEXT: it is filed on DATE, so it
      // arrives via continuedFromPrev, is clamped to NEXT's grid top and marked
      // as continuing from before. A day_item spans identically, so one of each.
      const records: DayRecords = {
        ...emptyRecords(),
        continuedFromPrev: {
          items: [itemSpan('film', 'other', `${DATE}T23:00`, `${NEXT}T05:00`, tz)],
          segments: [overnightDrive('drive', `${DATE}T22:00`, `${NEXT}T07:00`, tz)],
        },
      }

      const view = buildDayCalendarView(records, tz, NEXT)
      const gridStartNext = new Date(localDayWindowUtc(NEXT, tz).start).getTime()

      expect(view.events).toHaveLength(2)
      for (const event of view.events) {
        expect(event.continuesBefore).toBe(true)
        // Clamped exactly to the grid top, so RBC draws it from the very top down.
        expect(event.start.getTime()).toBe(gridStartNext)
      }

      const byId = new Map(view.events.map((e) => [e.recordId, e]))
      // Labels stay the real wall clock even though both are drawn from the top:
      // the drive still reads 22:00 -> 07:00 and the film 23:00 -> 05:00.
      expect(localTimeInZone(byId.get('drive')!.realStart.toISOString(), tz)).toBe('22:00')
      expect(localTimeInZone(byId.get('drive')!.realEnd.toISOString(), tz)).toBe('07:00')
      expect(localTimeInZone(byId.get('film')!.realStart.toISOString(), tz)).toBe('23:00')
      expect(localTimeInZone(byId.get('film')!.realEnd.toISOString(), tz)).toBe('05:00')
      // Both end inside NEXT's day, so neither also continues past the bottom.
      expect(byId.get('drive')!.continuesAfter).toBeFalsy()
      expect(byId.get('film')!.continuesAfter).toBeFalsy()
    })

    it('does not double-draw a record already on this grid as its own continuation (REE-124)', () => {
      // A record present both in the day's own sources and in continuedFromPrev
      // (a small-hours departure can be caught by both windows) is drawn once:
      // its own placement wins and the continuation projection is skipped.
      const drive = overnightDrive('drive', `${DATE}T22:00`, `${NEXT}T07:00`, tz)
      const records: DayRecords = {
        ...emptyRecords(),
        segments: [drive],
        continuedFromPrev: { items: [], segments: [drive] },
      }

      const view = buildDayCalendarView(records, tz, DATE)

      expect(view.events.filter((e) => e.recordId === 'drive')).toHaveLength(1)
      // The survivor is the day's own placement (continuesAfter), not the clamped
      // continuation projection (continuesBefore).
      expect(view.events[0].continuesAfter).toBe(true)
      expect(view.events[0].continuesBefore).toBeFalsy()
    })
  })
}

// The continuation block is drawn full-height from the grid top, so it must not
// bury the continuation day's own morning items in the overlap cascade. The
// cascade paints later array entries on top, so a real item that overlaps the
// continuation must come out at a deeper depth and later in paint order.
describe('broadcast-day grid view: a continuation block does not bury real items (REE-124)', () => {
  it('keeps a real morning item in front of a full-height continuation block', () => {
    const tz = 'UTC'
    const records: DayRecords = {
      ...emptyRecords(),
      // A real 05:00 lobby call this morning, inside the drive's continuation span.
      items: [itemAt('lobby', 'lobby_call', `${NEXT}T05:00`, tz)],
      // An overnight drive from last night still running into this morning
      // (22:00 -> 07:00), so it is clamped to the grid top and spans past 05:00.
      continuedFromPrev: {
        items: [],
        segments: [overnightDrive('drive', `${DATE}T22:00`, `${NEXT}T07:00`, tz)],
      },
    }

    const view = buildDayCalendarView(records, tz, NEXT)
    const laid = assignOverlapDepths(view.events)
    const byId = new Map(laid.map((l) => [l.recordId, l]))

    // The continuation block anchors the slot at depth 0 (flush, behind); the
    // real lobby call steps in front of it at a deeper depth.
    expect(byId.get('drive')!.depth).toBe(0)
    expect(byId.get('lobby')!.depth).toBe(1)

    // Paint order: the real item comes later in the array, so it draws on top and
    // is never buried under the continuation block.
    const driveIndex = laid.findIndex((l) => l.recordId === 'drive')
    const lobbyIndex = laid.findIndex((l) => l.recordId === 'lobby')
    expect(lobbyIndex).toBeGreaterThan(driveIndex)
  })
})

// The shift is the same wall-clock night in every zone, so the grid positions are
// byte-for-byte identical across UTC, Auckland and Los Angeles. If someone later
// reaches for a day-deriving shortcut in the view, this is what catches it.
describe('broadcast-day grid view: positions do not depend on the tour zone', () => {
  it('shifts the same night identically under UTC, Auckland and Los Angeles', () => {
    const tops = ZONES.map((tz) => {
      const records: DayRecords = {
        ...emptyRecords(),
        items: [itemAt('curfew', 'curfew', `${NEXT}T01:00`, tz)],
      }
      const view = buildDayCalendarView(records, tz, DATE)
      return localTimeInZone(view.events[0].start.toISOString(), tz)
    })
    // 01:00 next-day, shifted back four hours, is 21:00 on the grid in all three.
    expect(new Set(tops)).toEqual(new Set(['21:00']))
  })
})
