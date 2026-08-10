import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, createSecondTour, destroyFixture, type Fixture } from './fixture'
import { moveScheduleItem } from '@/lib/actions/move-schedule-item'
import { createDayItem } from '@/lib/actions/day-items'
import { createHotelStay } from '@/lib/actions/hotels'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { wallClockToUtc, localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'

// REE-54, Brief 43 step 3. The move action is the containment for the calendar
// library's weakest area: a drag hands back an instant, and this action, not the
// library, decides which day that instant is on. The assertions below are in the
// issue's order because the first is the one that ships unnoticed.
//
// Every case runs under Europe/London AND Pacific/Auckland. The vanish case in
// particular is invisible on a UTC tour and silently a day out everywhere else,
// so a single-zone suite would pass on a broken implementation. Instants are
// built with wallClockToUtc (the same helper the calendar adapter composes them
// with) so a wall clock in the tour's zone reads the same in the test as it does
// in the app, and the stored result is read back with localDateInZone /
// localTimeInZone, which is the fact everything downstream derives from.

const DATE = '2026-06-14'
const NEXT = '2026-06-15'

// June is BST in London (+1) and NZST in Auckland (+12, no DST), so neither zone
// is on UTC and neither passes a UTC-naive implementation by accident.
const ZONES = [{ tz: 'Europe/London' }, { tz: 'Pacific/Auckland' }]

describe.each(ZONES)('moveScheduleItem on $tz', ({ tz }) => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: tz })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function dayItemRow(id: string) {
    const { data } = await testDb
      .from('day_items')
      .select('kind, title, location, notes, show_id, starts_at, ends_at, tour_date_id')
      .eq('id', id)
      .single()
    if (!data) throw new Error('the day item under test disappeared')
    return data
  }

  // Case 1, and the one the whole issue exists for. A segment linked to the 14th
  // and departing at 22:00 local moves to 01:30 on the 15th. Its link must follow
  // the departure to the 15th, or it renders on neither day: the 14th filters it
  // out on time, the 15th never queries for it. This fails on any implementation
  // that writes depart_at alone.
  it('moves a segment past midnight and takes its day link with it', async () => {
    const { data: seg } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        mode: 'flight',
        origin: 'LHR',
        destination: 'CDG',
        depart_at: wallClockToUtc(`${DATE}T22:00`, tz),
        status: 'planned',
      })
      .select('id')
      .single()
    if (!seg) throw new Error('could not seed the segment under test')

    const result = await moveScheduleItem(fixture.tourId, {
      source: 'segment',
      id: seg.id,
      startsAt: wallClockToUtc(`${NEXT}T01:30`, tz),
    })
    expect(result.error).toBeNull()

    const { data: nextDay } = await testDb
      .from('tour_dates')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('date', NEXT)
      .single()
    if (!nextDay) throw new Error('the move did not create the 15th')

    const { data: after } = await testDb
      .from('transport_segments')
      .select('tour_date_id, depart_at')
      .eq('id', seg.id)
      .single()
    expect(after?.tour_date_id).toBe(nextDay.id)
    expect(localDateInZone(after!.depart_at!, tz)).toBe(NEXT)
    expect(localTimeInZone(after!.depart_at!, tz)).toBe('01:30')

    // And it is actually fetched by the 15th, not just stored against it.
    const day15 = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: nextDay.id,
      date: NEXT,
      timezone: tz,
    })
    expect(day15.segments.map((s) => s.id)).toContain(seg.id)
  })

  // Case 2, the inverse of case 1. A day_item's link and instant are allowed to
  // disagree: a 01:30 curfew belongs to the show it ends, so dragging it into the
  // small hours moves the instant but not the day. Getting case 1 and case 2 both
  // right is the point.
  it('leaves a day_item on its own day when a move crosses midnight', async () => {
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'curfew',
      start_clock: '23:00',
    })
    if (!created.itemId) throw new Error(created.error ?? 'could not seed the curfew')

    const result = await moveScheduleItem(fixture.tourId, {
      source: 'day_item',
      id: created.itemId,
      startsAt: wallClockToUtc(`${NEXT}T01:30`, tz),
    })
    expect(result.error).toBeNull()

    const after = await dayItemRow(created.itemId)
    // The link did not move.
    expect(after.tour_date_id).toBe(fixture.tourDateId)
    // The instant did.
    expect(localDateInZone(after.starts_at!, tz)).toBe(NEXT)
    expect(localTimeInZone(after.starts_at!, tz)).toBe('01:30')
  })

  // Case 3. A move writes the time and nothing else, and a resize writes only the
  // end. A move that nulled the fields it did not send is the bug class this whole
  // convention exists to stop.
  it('touches only the time on a move, and only the end on a resize', async () => {
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'load_in',
      title: 'Main load-in',
      start_clock: '10:00',
      end_clock: '10:30',
      location: 'Loading bay',
      notes: 'Ring the buzzer',
    })
    if (!created.itemId) throw new Error(created.error ?? 'could not seed the load-in')

    const before = await dayItemRow(created.itemId)

    // A pure move: start and end shift by the same amount, so the stated end
    // travels with the item.
    const moved = await moveScheduleItem(fixture.tourId, {
      source: 'day_item',
      id: created.itemId,
      startsAt: wallClockToUtc(`${DATE}T14:00`, tz),
      endsAt: wallClockToUtc(`${DATE}T14:30`, tz),
    })
    expect(moved.error).toBeNull()

    const afterMove = await dayItemRow(created.itemId)
    expect(afterMove.title).toBe(before.title)
    expect(afterMove.location).toBe(before.location)
    expect(afterMove.notes).toBe(before.notes)
    expect(afterMove.kind).toBe(before.kind)
    expect(afterMove.show_id).toBe(before.show_id)
    expect(localTimeInZone(afterMove.starts_at!, tz)).toBe('14:00')

    // A resize of the end edge: same start, later end. Only ends_at moves.
    const resized = await moveScheduleItem(fixture.tourId, {
      source: 'day_item',
      id: created.itemId,
      startsAt: wallClockToUtc(`${DATE}T14:00`, tz),
      endsAt: wallClockToUtc(`${DATE}T15:00`, tz),
    })
    expect(resized.error).toBeNull()

    const afterResize = await dayItemRow(created.itemId)
    expect(afterResize.starts_at).toBe(afterMove.starts_at)
    expect(localTimeInZone(afterResize.ends_at!, tz)).toBe('15:00')
    expect(afterResize.title).toBe(before.title)
    expect(afterResize.location).toBe(before.location)
  })

  // Case 4. REE-53's invariant, asserted end to end. A move preserves a null end
  // rather than converting the adapter's synthesised one into a stored value.
  it('leaves a null end null across a move', async () => {
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'doors',
      start_clock: '19:00',
    })
    if (!created.itemId) throw new Error(created.error ?? 'could not seed the doors item')

    const seeded = await dayItemRow(created.itemId)
    expect(seeded.ends_at).toBeNull() // precondition

    const result = await moveScheduleItem(fixture.tourId, {
      source: 'day_item',
      id: created.itemId,
      startsAt: wallClockToUtc(`${DATE}T20:00`, tz),
      // The synthesised end comes back as null on a move.
      endsAt: null,
    })
    expect(result.error).toBeNull()

    const after = await dayItemRow(created.itemId)
    expect(after.ends_at).toBeNull()
    expect(localTimeInZone(after.starts_at!, tz)).toBe('20:00')
  })

  // Case 5. A hotel check-in dragged across midnight. tour_date_id and
  // check_in_date are a composite foreign key onto tour_dates(id, date), so an
  // inconsistent write is a 23503, not a silent bug. Assert the row, per the issue.
  it('keeps a hotel check-in date and its day link consistent across a move', async () => {
    const created = await createHotelStay(fixture.tourId, {
      tour_date_id: fixture.tourDateId,
      name: 'Test Hotel',
      check_in_date: DATE,
      check_in_time: '23:00',
      check_out_date: NEXT,
    })
    if (!created.stayId) throw new Error(created.error ?? 'could not seed the hotel stay')

    const result = await moveScheduleItem(fixture.tourId, {
      source: 'hotel',
      id: created.stayId,
      startsAt: wallClockToUtc(`${NEXT}T00:30`, tz),
    })
    expect(result.error).toBeNull()

    const { data: nextDay } = await testDb
      .from('tour_dates')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('date', NEXT)
      .single()
    if (!nextDay) throw new Error('the move did not create the 15th')

    const { data: after } = await testDb
      .from('hotel_stays')
      .select('check_in_date, check_in_time, tour_date_id')
      .eq('id', created.stayId)
      .single()
    expect(after?.check_in_date).toBe(NEXT)
    expect(after?.tour_date_id).toBe(nextDay.id)
    expect(after?.check_in_time?.slice(0, 5)).toBe('00:30')
  })

  // Case 6. A valid tour id with an item id from a second tour on the same
  // account. RLS passes (one account owns both), so only the action's own
  // cross-tour check stands between them. It must reject and write nothing. A
  // second account would be caught by RLS and prove nothing.
  it('refuses an item from another tour on the same account and writes nothing', async () => {
    const other = await createSecondTour(fixture)

    const { data: seg } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: other.tourId,
        tour_date_id: other.tourDateId,
        mode: 'flight',
        origin: 'MAD',
        destination: 'BCN',
        depart_at: `${other.date}T09:00:00.000Z`,
        status: 'planned',
      })
      .select('id, depart_at, tour_date_id')
      .single()
    if (!seg) throw new Error('could not seed the other tour segment')

    const result = await moveScheduleItem(fixture.tourId, {
      source: 'segment',
      id: seg.id,
      startsAt: `${other.date}T23:30:00.000Z`,
    })
    expect(result.error).toBeTruthy()

    const { data: after } = await testDb
      .from('transport_segments')
      .select('depart_at, tour_date_id')
      .eq('id', seg.id)
      .single()
    // Byte identical to the seed: nothing was written.
    expect(after?.depart_at).toBe(seg.depart_at)
    expect(after?.tour_date_id).toBe(seg.tour_date_id)
  })
})
