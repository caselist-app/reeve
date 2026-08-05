import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDaySheet, updateShow } from '@/lib/actions/shows'
import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'

// A tour day is a working period, not a calendar day. updateDaySheet pinned
// every time to the show's own date, so a curfew of 01:30 was stored twenty
// hours BEFORE the show it ends, and the timeline (which sorts on the stored
// timestamp) put it above venue access. A TM scanning the day saw the night
// finish before it started.
//
// These assert the stored instant, read back in the tour's timezone, because
// that is the fact everything else derives from. The fixture tour is on
// Europe/London and the date is in BST, so a UTC-naive implementation passes
// nothing here by accident.

const TZ = 'Europe/London'

describe('day-sheet times that cross midnight', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readDaySheet() {
    const { data } = await testDb
      .from('day_sheets')
      .select('*')
      .eq('show_id', fixture.showId)
      .single()
    return data
  }

  it('stores a small-hours curfew on the morning after the show', async () => {
    const result = await updateDaySheet(fixture.showId, {
      load_in: '10:00',
      doors: '19:00',
      headliner_off: '23:00',
      curfew: '01:30',
      load_out: '03:00',
    })
    expect(result.error).toBeNull()

    const sheet = await readDaySheet()
    if (!sheet?.curfew || !sheet.load_out || !sheet.doors) {
      throw new Error('day sheet did not store the times under test')
    }

    // The day after the show, and still 01:30 on the clock.
    expect(localDateInZone(sheet.curfew, TZ)).toBe('2026-06-15')
    expect(localTimeInZone(sheet.curfew, TZ)).toBe('01:30')

    // Load-out is later the same morning, not rolled a second time.
    expect(localDateInZone(sheet.load_out, TZ)).toBe('2026-06-15')
    expect(localTimeInZone(sheet.load_out, TZ)).toBe('03:00')

    // Doors stayed put.
    expect(localDateInZone(sheet.doors, TZ)).toBe('2026-06-14')
  })

  it('orders the day correctly as instants, which is what the timeline sorts on', async () => {
    // The visible symptom, expressed as the thing that causes it. The timeline
    // sorts on the raw timestamp, so if curfew is stored before doors it renders
    // at the top of the day above venue access.
    await updateDaySheet(fixture.showId, {
      venue_access: '09:00',
      load_in: '10:00',
      doors: '19:00',
      curfew: '01:30',
      load_out: '03:00',
    })

    const sheet = await readDaySheet()
    if (!sheet?.venue_access || !sheet.doors || !sheet.curfew || !sheet.load_out) {
      throw new Error('day sheet did not store the times under test')
    }

    const order = [sheet.venue_access, sheet.doors, sheet.curfew, sheet.load_out]
    const sorted = [...order].sort()
    expect(sorted).toEqual(order)
  })

  it('leaves an early lobby call on the show day', async () => {
    // The case every cutoff rule gets wrong, and the reason the rule splits
    // fields into two groups rather than using an hour.
    await updateDaySheet(fixture.showId, {
      hotel_departure: '05:00',
      load_in: '10:00',
      doors: '19:00',
      curfew: '01:30',
    })

    const sheet = await readDaySheet()
    if (!sheet?.hotel_departure || !sheet.curfew) {
      throw new Error('day sheet did not store the times under test')
    }

    expect(localDateInZone(sheet.hotel_departure, TZ)).toBe('2026-06-14')
    expect(localTimeInZone(sheet.hotel_departure, TZ)).toBe('05:00')
    // And the curfew on the same sheet still rolled.
    expect(localDateInZone(sheet.curfew, TZ)).toBe('2026-06-15')
  })

  it('leaves catering on the show day even when load-out is after midnight', async () => {
    // Running the roll-over over the whole field list in order would read
    // breakfast at 07:00 as later than the 02:00 load-out that precedes it in
    // DAY_SHEET_TIME_FIELDS, and serve it the morning after the show.
    await updateDaySheet(fixture.showId, {
      catering_breakfast_start: '07:00',
      catering_dinner_start: '17:00',
      doors: '19:00',
      curfew: '01:00',
      load_out: '02:00',
    })

    const sheet = await readDaySheet()
    if (!sheet?.catering_breakfast_start || !sheet.load_out) {
      throw new Error('day sheet did not store the times under test')
    }

    expect(localDateInZone(sheet.catering_breakfast_start, TZ)).toBe('2026-06-14')
    expect(localDateInZone(sheet.load_out, TZ)).toBe('2026-06-15')
  })

  it('keeps a festival daytime running order on the show day', async () => {
    // Anchoring on this show's own latest daytime time rather than a constant
    // hour is what makes this work. Every one of these is earlier than a normal
    // show's doors and none of them has crossed midnight.
    await updateDaySheet(fixture.showId, {
      load_in: '06:00',
      doors: '10:00',
      support_on: '11:00',
      support_off: '11:30',
      headliner_on: '12:00',
      headliner_off: '13:00',
      curfew: '23:00',
    })

    const sheet = await readDaySheet()
    if (!sheet?.headliner_off || !sheet.curfew) {
      throw new Error('day sheet did not store the times under test')
    }

    expect(localDateInZone(sheet.headliner_off, TZ)).toBe('2026-06-14')
    expect(localDateInZone(sheet.curfew, TZ)).toBe('2026-06-14')
  })

  it('carries the roll-over when the show moves date', async () => {
    // The failure most likely to ship unnoticed: it needs two actions in
    // sequence before anything looks wrong. shiftDaySheetToDate re-derives each
    // time from its wall-clock reading, so without carrying the day offset a
    // curfew stored on the 15th is flattened onto the new show date.
    await updateDaySheet(fixture.showId, {
      load_in: '10:00',
      doors: '19:00',
      curfew: '01:30',
      load_out: '03:00',
    })

    const moved = await updateShow(fixture.showId, {
      date: '2026-06-20',
      venue_name: 'Test Venue',
    })
    expect(moved.error).toBeNull()

    const sheet = await readDaySheet()
    if (!sheet?.curfew || !sheet.load_out || !sheet.doors) {
      throw new Error('day sheet did not store the times under test')
    }

    // Doors moved with the show. The curfew moved with it and stayed the
    // following morning, rather than landing on the 20th at 01:30.
    expect(localDateInZone(sheet.doors, TZ)).toBe('2026-06-20')
    expect(localDateInZone(sheet.curfew, TZ)).toBe('2026-06-21')
    expect(localTimeInZone(sheet.curfew, TZ)).toBe('01:30')
    expect(localDateInZone(sheet.load_out, TZ)).toBe('2026-06-21')
  })

  it('does not rewrite a time the save never submitted', async () => {
    // The roll-over is computed over the merged sheet, so this action now reads
    // the stored row that it did not read before. That must not turn it into a
    // whole-row write: Brief 37 is the reason this test exists on every action
    // that gained a read.
    await updateDaySheet(fixture.showId, {
      doors: '19:00',
      curfew: '01:30',
      catering_dinner_start: '17:00',
    })

    const before = await readDaySheet()

    // A partial save, the shape confirmExtraction sends.
    await updateDaySheet(fixture.showId, { load_in: '11:00' })

    const after = await readDaySheet()
    expect(after?.curfew).toBe(before?.curfew)
    expect(after?.catering_dinner_start).toBe(before?.catering_dinner_start)
    if (!after?.load_in) throw new Error('the submitted field was not written')
    expect(localTimeInZone(after.load_in, TZ)).toBe('11:00')
  })
})
