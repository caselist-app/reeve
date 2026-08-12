import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import {
  buildDayCalendarView,
  COULD_NOT_LOAD_MESSAGE,
} from '@/lib/schedule/day-calendar-view'
import type { DayRecords } from '@/lib/schedule/day-records'
import { addDays, wallClockToUtc } from '@/lib/schedule/datetime'

// Brief 43 step 4 (REE-55). The day is a calendar grid now, and this is where
// its correctness is asserted: no component in this repo can be rendered (no
// jsdom, no testing-library), so the seam that a test can reach is the pure
// view model between fetchDayRecords and the grid.
//
// Three things have to hold, and each is one of the acceptance criteria written
// as a test rather than a manual check:
//
//   1. All three day sources become grid events. A day_item, a transport
//      segment and a hotel check-in are different tables and different shapes,
//      and the grid does not care: each with a start instant is one event.
//   2. A record with no start instant is set aside, not dropped. An invented
//      start would be the same class of lie as an invented end, so it goes in
//      the "No time set" rail instead of onto the grid.
//   3. A failed read is a message, not a blank grid. The grid draws its hours
//      whether or not anything is on them, so an empty grid cannot be allowed to
//      stand in for "we could not read this day".

const DATE = '2030-06-14'
// Europe/London in June is an hour off UTC, so a UTC-only assertion would pass
// for a wrong-zone implementation. Every instant below is chosen to sit inside
// this tour-local day regardless.
const TIMEZONE = 'Europe/London'

describe('the three day sources map to grid events', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('produces one event per source through fetchDayRecords plus the adapter', async () => {
    // One of each positioned source on the day: a timed day_item, a segment with
    // a departure, and a hotel checking in with a time.
    const { error: itemError } = await testDb.from('day_items').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'soundcheck',
      starts_at: `${DATE}T14:00:00Z`,
    })
    if (itemError) throw new Error(`could not seed the day_item: ${itemError.message}`)

    const { error: segError } = await testDb.from('transport_segments').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      mode: 'flight',
      origin: 'London',
      destination: 'Paris',
      depart_at: `${DATE}T12:00:00Z`,
    })
    if (segError) throw new Error(`could not seed the segment: ${segError.message}`)

    // tour_date_id and check_in_date are a composite foreign key onto
    // tour_dates (id, date), so check_in_date has to be the fixture day.
    const { error: hotelError } = await testDb.from('hotel_stays').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      check_in_date: DATE,
      check_in_time: '15:00',
      check_out_date: '2030-06-15',
      name: 'The Standard',
      city: 'London',
    })
    if (hotelError) throw new Error(`could not seed the hotel: ${hotelError.message}`)

    const records = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
      timezone: TIMEZONE,
    })

    // A failed read must not read as a day with no items, which is what an
    // assertion on an empty array would do.
    expect(records.itemsError).toBeNull()

    const view = buildDayCalendarView(records, TIMEZONE, DATE)

    // One from each source, all positioned, none set aside.
    expect(view.events).toHaveLength(3)
    expect(view.unpositioned).toHaveLength(0)

    const sources = view.events.map((e) => e.source).sort()
    expect(sources).toEqual(['day_item', 'hotel', 'segment'])
  })

  it('sets aside an item with no start instead of putting it on the grid', async () => {
    // A day_item with a null starts_at: after Brief 42 a show can be created with
    // no times, so this is the normal state of a fresh day, not an edge case.
    const { error } = await testDb.from('day_items').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'load_in',
      starts_at: null,
    })
    if (error) throw new Error(`could not seed the untimed item: ${error.message}`)

    const records = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
      timezone: TIMEZONE,
    })
    expect(records.itemsError).toBeNull()

    const view = buildDayCalendarView(records, TIMEZONE, DATE)

    // On the rail, not the grid.
    expect(view.events).toHaveLength(0)
    expect(view.unpositioned).toHaveLength(1)
    expect(view.unpositioned[0]).toMatchObject({ source: 'day_item' })
  })
})

// REE-123. An overnight drive departs one night and arrives the next morning,
// so its interval breaks over the 04:00 broadcast boundary and it is one record
// that has to show on two days: a normal block on the day it departs, and a
// read-only projection clamped to the top of the day it arrives. The fetch is the
// half a unit test cannot reach, so it is asserted here against a real database.
describe('a block that breaks over the broadcast boundary shows on both days', () => {
  let fixture: Fixture
  const NEXT = addDays(DATE, 1)
  let nextDateId: string

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })
    // The arrival day needs its own tour_dates row, or the day view renders no
    // grid for it at all (the null-tourDateId branch of fetchDayRecords).
    const { data, error } = await testDb
      .from('tour_dates')
      .insert({ tour_id: fixture.tourId, date: NEXT, day_type: 'travel' })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not seed the arrival day: ${error?.message}`)
    nextDateId = data.id
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('is continues-after on the departure day and a read-only spill on the arrival day', async () => {
    // Departs DATE 20:00, arrives NEXT 09:46, both wall-clock in the tour zone.
    // Owned by (linked to) its departure day, exactly as createTransportSegment
    // files it.
    const { data: seg, error } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        origin: 'Venue',
        destination: 'O2 Arena',
        depart_at: wallClockToUtc(`${DATE}T20:00`, TIMEZONE),
        arrive_at: wallClockToUtc(`${NEXT}T09:46`, TIMEZONE),
      })
      .select('id')
      .single()
    if (error || !seg) throw new Error(`could not seed the overnight drive: ${error?.message}`)

    // Departure day: a home block, flagged as continuing past the grid bottom, and
    // still interactive (its home day owns the edit).
    const departRecords = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
      timezone: TIMEZONE,
    })
    const departView = buildDayCalendarView(departRecords, TIMEZONE, DATE)
    const departBlock = departView.events.find((e) => e.recordId === seg.id)
    expect(departBlock).toBeDefined()
    expect(departBlock!.continuesAfter).toBe(true)
    expect(departBlock!.readOnly).toBeFalsy()

    // Arrival day: fetched as continuation spillover (this is the fetch the unit
    // suite cannot exercise), then drawn as a read-only block clamped to the top
    // rather than lost to the "Outside this day" rail.
    const arriveRecords = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: nextDateId,
      date: NEXT,
      timezone: TIMEZONE,
    })
    expect(arriveRecords.continuation.segments.map((s) => s.id)).toContain(seg.id)
    // The spill is not counted into the arrival day's own roster.
    expect(arriveRecords.segmentIds).not.toContain(seg.id)

    const arriveView = buildDayCalendarView(arriveRecords, TIMEZONE, NEXT)
    const arriveBlock = arriveView.events.find((e) => e.recordId === seg.id)
    expect(arriveBlock).toBeDefined()
    expect(arriveBlock!.continuesBefore).toBe(true)
    expect(arriveBlock!.readOnly).toBe(true)
    expect(arriveView.outsideDay.map((e) => e.recordId)).not.toContain(seg.id)
  })
})

describe('a failed read is a message, not a blank grid', () => {
  it('carries the could-not-load message when itemsError is set', () => {
    // Constructed rather than fetched: forcing a real PostgREST failure is not
    // something a passing database will do on command, and the thing under test
    // is what the view does with itemsError once it is set. An empty grid with a
    // set error is the exact shape this guards against, so items is empty here on
    // purpose.
    const records: DayRecords = {
      shows: [],
      items: [],
      itemsError: 'relation "day_items" does not exist',
      segments: [],
      hotels: [],
      lateNight: { segments: [] },
      continuation: { segments: [], items: [] },
      segmentIds: [],
      hotelStayIds: [],
    }

    const view = buildDayCalendarView(records, TIMEZONE, DATE)

    expect(view.events).toHaveLength(0)
    // A blank grid would say nothing. The message says it could not load, which
    // is the difference between a confident wrong answer and an honest one.
    expect(view.errorMessage).toBe(COULD_NOT_LOAD_MESSAGE)
  })

  it('leaves errorMessage null on a clean read', () => {
    const records: DayRecords = {
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

    expect(buildDayCalendarView(records, TIMEZONE, DATE).errorMessage).toBeNull()
  })
})
