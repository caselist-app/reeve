import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateShow } from '@/lib/actions/shows'
import { createDayItem } from '@/lib/actions/day-items'
import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'
import { fetchDayRecords } from '@/lib/schedule/day-records'

// A tour day is a working period, not a calendar day. Before Brief 40 every time
// was pinned to the show's own date, so a curfew of 01:30 was stored twenty hours
// BEFORE the show it ends, and the timeline (which sorts on the stored timestamp)
// put it above venue access. A TM scanning the day saw the night finish before it
// started.
//
// Brief 42 moved the rule from columns to rows and did not reopen it. This file
// moved with it: it used to prove the rule through updateDaySheet, which nothing
// calls any more, so it was proving a dead path. It now goes through
// createDayItem, which is what the day view, the add form and the email
// extraction all use.
//
// ONE THING GENUINELY CHANGED, and it is the reason each test below adds its
// times in running order rather than in one call. The roll-over anchors on the
// day's latest daytime time, and a day is built one item at a time now, so each
// write sees the day as it stands. Adding a curfew before any daytime time falls
// back to the 18:00 anchor. That still rolls 01:30 correctly, but the ordering is
// what a TM actually does and it is what these assertions are about.
//
// These assert the stored instant, read back in the tour's timezone, because that
// is the fact everything else derives from. The fixture tour is on Europe/London
// and the date is in BST, so a UTC-naive implementation passes nothing here by
// accident.

const TZ = 'Europe/London'

describe('day item times that cross midnight', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // Adds items in the order given, which is the order a TM builds a day in.
  async function setTimes(times: [string, string][]) {
    for (const [kind, clock] of times) {
      const result = await createDayItem({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        show_id: fixture.showId,
        kind,
        start_clock: clock,
      })
      // Thrown rather than asserted: a rejected write would leave every
      // assertion below reading null and passing for the wrong reason.
      if (result.error) throw new Error(`could not set ${kind}: ${result.error}`)
    }
  }

  async function storedTime(kind: string): Promise<string> {
    const { data } = await testDb
      .from('day_items')
      .select('starts_at')
      .eq('show_id', fixture.showId)
      .eq('kind', kind)
      .single()
    if (!data?.starts_at) throw new Error(`the day did not store a ${kind}`)
    return data.starts_at
  }

  it('stores a small-hours curfew on the morning after the show', async () => {
    await setTimes([
      ['load_in', '10:00'],
      ['doors', '19:00'],
      ['headliner_off', '23:00'],
      ['curfew', '01:30'],
      ['load_out', '03:00'],
    ])

    const curfew = await storedTime('curfew')
    const loadOut = await storedTime('load_out')

    // The day after the show, and still 01:30 on the clock.
    expect(localDateInZone(curfew, TZ)).toBe('2026-06-15')
    expect(localTimeInZone(curfew, TZ)).toBe('01:30')

    // Load-out is later the same morning, not rolled a second time.
    expect(localDateInZone(loadOut, TZ)).toBe('2026-06-15')
    expect(localTimeInZone(loadOut, TZ)).toBe('03:00')

    // Doors stayed put.
    expect(localDateInZone(await storedTime('doors'), TZ)).toBe('2026-06-14')
  })

  it('orders the day correctly as instants, which is what the timeline sorts on', async () => {
    // The visible symptom, expressed as the thing that causes it. The timeline
    // sorts on the raw timestamp, so if curfew is stored before doors it renders
    // at the top of the day above venue access.
    await setTimes([
      ['venue_access', '09:00'],
      ['load_in', '10:00'],
      ['doors', '19:00'],
      ['curfew', '01:30'],
      ['load_out', '03:00'],
    ])

    const order = [
      await storedTime('venue_access'),
      await storedTime('doors'),
      await storedTime('curfew'),
      await storedTime('load_out'),
    ].map((iso) => new Date(iso).getTime())

    const sorted = [...order].sort((a, b) => a - b)
    expect(sorted).toEqual(order)
  })

  it('reads that order back off the day view in the same sequence', async () => {
    // The half the old test could not reach, because the timeline sorted a wide
    // row in JavaScript. The query orders on starts_at now, so this asserts the
    // running order a TM actually sees.
    await setTimes([
      ['venue_access', '09:00'],
      ['doors', '19:00'],
      ['curfew', '01:30'],
    ])

    const records = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: '2026-06-14',
      timezone: TZ,
    })

    expect(records.itemsError).toBeNull()
    expect(records.items.map((i) => i.kind)).toEqual(['venue_access', 'doors', 'curfew'])
  })

  it('leaves an early lobby call on the show day', async () => {
    // The case every cutoff rule gets wrong, and the reason the rule anchors on
    // the day's own latest daytime time rather than on an hour.
    await setTimes([
      ['lobby_call', '05:00'],
      ['load_in', '10:00'],
      ['doors', '19:00'],
      ['curfew', '01:30'],
    ])

    const lobbyCall = await storedTime('lobby_call')

    expect(localDateInZone(lobbyCall, TZ)).toBe('2026-06-14')
    expect(localTimeInZone(lobbyCall, TZ)).toBe('05:00')
    // And the curfew on the same day still rolled.
    expect(localDateInZone(await storedTime('curfew'), TZ)).toBe('2026-06-15')
  })

  it('leaves catering on the show day even when load-out is after midnight', async () => {
    // Catering is three kinds now rather than six columns, and none of them can
    // cross midnight, so breakfast at 07:00 cannot be dragged onto the following
    // morning by a 02:00 load-out.
    await setTimes([
      ['catering_breakfast', '07:00'],
      ['catering_dinner', '17:00'],
      ['doors', '19:00'],
      ['curfew', '01:00'],
      ['load_out', '02:00'],
    ])

    expect(localDateInZone(await storedTime('catering_breakfast'), TZ)).toBe('2026-06-14')
    expect(localDateInZone(await storedTime('load_out'), TZ)).toBe('2026-06-15')
  })

  it('keeps a festival daytime running order on the show day', async () => {
    // Anchoring on this show's own latest daytime time rather than a constant
    // hour is what makes this work. Every one of these is earlier than a normal
    // show's doors and none of them has crossed midnight.
    await setTimes([
      ['load_in', '06:00'],
      ['doors', '10:00'],
      ['support_on', '11:00'],
      ['support_off', '11:30'],
      ['headliner_on', '12:00'],
      ['headliner_off', '13:00'],
      ['curfew', '23:00'],
    ])

    expect(localDateInZone(await storedTime('headliner_off'), TZ)).toBe('2026-06-14')
    expect(localDateInZone(await storedTime('curfew'), TZ)).toBe('2026-06-14')
  })

  it('carries the roll-over when the show moves date', async () => {
    // The failure most likely to ship unnoticed: it needs two actions in
    // sequence before anything looks wrong. shiftDayItemsToDate re-derives each
    // instant from its wall-clock reading, so without carrying the day offset a
    // curfew stored on the 15th is flattened onto the new show date.
    await setTimes([
      ['load_in', '10:00'],
      ['doors', '19:00'],
      ['curfew', '01:30'],
      ['load_out', '03:00'],
    ])

    const moved = await updateShow(fixture.showId, {
      date: '2026-06-20',
      venue_name: 'Test Venue',
    })
    expect(moved.error).toBeNull()

    // Doors moved with the show. The curfew moved with it and stayed the
    // following morning, rather than landing on the 20th at 01:30.
    expect(localDateInZone(await storedTime('doors'), TZ)).toBe('2026-06-20')
    expect(localDateInZone(await storedTime('curfew'), TZ)).toBe('2026-06-21')
    expect(localTimeInZone(await storedTime('curfew'), TZ)).toBe('01:30')
    expect(localDateInZone(await storedTime('load_out'), TZ)).toBe('2026-06-21')
  })

  it('does not rewrite an item the save never mentioned', async () => {
    // The roll-over is computed across the whole merged day, so every write
    // reads items it is not writing. That must not turn into a whole-day write.
    // Adding a load-in can change which day a curfew belongs on, and the curfew
    // still must not move: a save that never mentioned it does not get to touch
    // it. Same trade updateDaySheet made, and the reason Brief 37 exists.
    await setTimes([
      ['doors', '19:00'],
      ['curfew', '01:30'],
      ['catering_dinner', '17:00'],
    ])

    const curfewBefore = await storedTime('curfew')
    const dinnerBefore = await storedTime('catering_dinner')

    await setTimes([['load_in', '11:00']])

    expect(await storedTime('curfew')).toBe(curfewBefore)
    expect(await storedTime('catering_dinner')).toBe(dinnerBefore)
    expect(localTimeInZone(await storedTime('load_in'), TZ)).toBe('11:00')
  })

  it('shows a small-hours departure as the tail of the previous day', async () => {
    // The case Matt described: adding travel to a show day. A red-eye at 01:30
    // on the 15th is stored on the 15th, correctly, and the TM planning the
    // 14th still needs to see it. It appears in both places on purpose, because
    // it genuinely is the end of one day and the start of the next.
    const { data: segment } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'flight',
        origin: 'London',
        destination: 'Berlin',
        // 01:30 on 15 June in Europe/London, which is BST, so 00:30Z.
        depart_at: '2026-06-15T00:30:00.000Z',
        status: 'planned',
      })
      .select('id')
      .single()

    if (!segment) throw new Error('could not create the segment under test')

    const showDay = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: '2026-06-14',
      timezone: TZ,
    })

    expect(showDay.lateNight.segments.map((s) => s.id)).toContain(segment.id)
    // And not in the day's own records, which would double it on one screen.
    expect(showDay.segments.map((s) => s.id)).not.toContain(segment.id)
    // The tail does not contribute to the day roster: those people are
    // travelling on the 15th, whatever day the card is shown on.
    expect(showDay.segmentIds).not.toContain(segment.id)
  })

  it('leaves a normal morning departure out of the previous day', async () => {
    // The other side of the boundary. 08:00 is simply the next day's morning
    // and has nothing to do with the night before.
    const { data: segment } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'rail',
        origin: 'London',
        destination: 'Paris',
        depart_at: '2026-06-15T07:00:00.000Z', // 08:00 BST
        status: 'planned',
      })
      .select('id')
      .single()

    if (!segment) throw new Error('could not create the segment under test')

    const showDay = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: '2026-06-14',
      timezone: TZ,
    })

    expect(showDay.lateNight.segments).toHaveLength(0)
  })

  it('does not put a late departure on the day it actually departs into its own tail', async () => {
    // A 01:30 departure on the 14th belongs to the 13th's tail, not the 14th's.
    // Without this the tail would pick up the day's own small hours and render
    // every red-eye twice on one screen.
    const { data: segment } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'ground',
        origin: 'Venue',
        destination: 'Hotel',
        depart_at: '2026-06-14T00:30:00.000Z', // 01:30 BST on the 14th
        status: 'planned',
      })
      .select('id')
      .single()

    if (!segment) throw new Error('could not create the segment under test')

    const showDay = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: '2026-06-14',
      timezone: TZ,
    })

    expect(showDay.lateNight.segments).toHaveLength(0)
    expect(showDay.segments.map((s) => s.id)).toContain(segment.id)
  })

})
