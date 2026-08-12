import { describe, it, expect } from 'vitest'
import { buildDayCalendarView } from '@/lib/schedule/day-calendar-view'
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
    lateNight: { segments: [] },
    continuation: { segments: [], items: [] },
    segmentIds: [],
    hotelStayIds: [],
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

// A drive that breaks over the boundary: it departs one wall-clock evening and
// arrives the next morning, so its interval crosses 04:00 and it belongs on both
// broadcast days (REE-123).
function spanningDrive(
  id: string,
  departLocal: string,
  arriveLocal: string,
  tz: string,
): DaySegment {
  return {
    id,
    mode: 'ground',
    origin: 'Venue',
    destination: 'O2 Arena',
    depart_at: wallClockToUtc(departLocal, tz),
    arrive_at: wallClockToUtc(arriveLocal, tz),
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

    // REE-123. A block that breaks over the boundary is one record shown on two
    // days. These two cases are the two halves of the same overnight drive:
    // departs DATE 20:00, arrives NEXT 09:46.
    it('flags the departure-day block as continuing after, kept interactive', () => {
      const records: DayRecords = {
        ...emptyRecords(),
        segments: [spanningDrive('drive', `${DATE}T20:00`, `${NEXT}T09:46`, tz)],
      }

      const view = buildDayCalendarView(records, tz, DATE)

      const drive = view.events.find((e) => e.recordId === 'drive')
      expect(drive).toBeDefined()
      // Shown as a normal block from its real departure; RBC clamps the height to
      // the grid, so start/end stay real and the drag maths is untouched.
      expect(drive!.continuesAfter).toBe(true)
      expect(drive!.continuesBefore).toBeFalsy()
      expect(drive!.readOnly).toBeFalsy()
      expect(localTimeInZone(drive!.realStart.toISOString(), tz)).toBe('20:00')
      // The block runs past the grid bottom into the next broadcast day.
      expect(drive!.end.getTime()).toBeGreaterThan(gridEnd)
      // It is not railed.
      expect(view.outsideDay.map((e) => e.recordId)).not.toContain('drive')
    })

    it('draws the spill on the arrival day as a read-only block clamped to the top', () => {
      const nextStart = new Date(localDayWindowUtc(NEXT, tz).start).getTime()
      const records: DayRecords = {
        ...emptyRecords(),
        continuation: {
          segments: [spanningDrive('drive', `${DATE}T20:00`, `${NEXT}T09:46`, tz)],
          items: [],
        },
      }

      const view = buildDayCalendarView(records, tz, NEXT)

      const drive = view.events.find((e) => e.recordId === 'drive')
      expect(drive).toBeDefined()
      // A read-only projection: clamped to the grid top, marked as continuing from
      // before, and not draggable. This is what was previously lost to the
      // "Outside this day" rail (REE-123).
      expect(drive!.continuesBefore).toBe(true)
      expect(drive!.readOnly).toBe(true)
      expect(drive!.start.getTime()).toBe(nextStart)
      // The label still reads the real wall clock, not the clamped top.
      expect(localTimeInZone(drive!.realStart.toISOString(), tz)).toBe('20:00')
      expect(localTimeInZone(drive!.realEnd.toISOString(), tz)).toBe('09:46')
      // It reaches the grid and is not railed.
      expect(view.outsideDay.map((e) => e.recordId)).not.toContain('drive')
    })

    it('draws a day_item that spans the boundary on the arrival day too', () => {
      const item: DayItem = {
        ...itemAt('afterparty', 'other', `${DATE}T23:00`, tz),
        ends_at: wallClockToUtc(`${NEXT}T05:30`, tz),
      }
      const records: DayRecords = {
        ...emptyRecords(),
        continuation: { segments: [], items: [item] },
      }

      const view = buildDayCalendarView(records, tz, NEXT)

      const spill = view.events.find((e) => e.recordId === 'afterparty')
      expect(spill).toBeDefined()
      expect(spill!.continuesBefore).toBe(true)
      expect(spill!.readOnly).toBe(true)
    })

    it('does not double a pre-dawn record that is both a home event and a spill candidate', () => {
      // A 02:00 departure on this date is a home record (its own day fetches it)
      // and the spanning query can also surface it. Whichever copy places it, it
      // is drawn exactly once and never left in the rail as well as on the grid.
      const drive = spanningDrive('predawn', `${DATE}T02:00`, `${DATE}T05:00`, tz)
      const records: DayRecords = {
        ...emptyRecords(),
        segments: [drive],
        continuation: { segments: [drive], items: [] },
      }

      const view = buildDayCalendarView(records, tz, DATE)

      const matches = view.events.filter((e) => e.recordId === 'predawn')
      expect(matches).toHaveLength(1)
    })
  })
}

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
