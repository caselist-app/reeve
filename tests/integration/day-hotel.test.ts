import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createHotelStay } from '@/lib/actions/hotels'
import { resolveHotelForDay } from '@/lib/schedule/day-hotel'

// REE-179. resolveHotelForDay is the day info Hotel block's one lookup: a
// direct tour_date_id match, else an unlinked stay whose check_in_date names
// the day. Mirrors the link-first, date-matched-fallback shape
// lib/schedule/day-records.ts already uses for transport segments.
const DATE = '2031-03-10'
const OTHER_DATE = '2031-03-24'

describe('resolveHotelForDay', () => {
  let fixture: Fixture

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // Red first: no hotel exists at all for this tour, so the function must not
  // throw and must not hand back some other day's stay.
  it('resolves to null, not an unrelated stay, when there is no matching hotel', async () => {
    fixture = await createFixture({ date: DATE })

    const unrelated = await createHotelStay(fixture.tourId, {
      name: 'Unrelated Hotel',
      check_in_date: OTHER_DATE,
    })
    if (unrelated.error) throw new Error(unrelated.error)

    const hotel = await resolveHotelForDay(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
    })

    expect(hotel).toBeNull()
  })

  it('resolves a hotel linked by tour_date_id', async () => {
    fixture = await createFixture({ date: DATE })

    const created = await createHotelStay(fixture.tourId, {
      tour_date_id: fixture.tourDateId,
      name: 'Linked Hotel',
      check_in_date: DATE,
      check_in_time: '15:00:00',
    })
    if (created.error || !created.stayId) throw new Error(created.error ?? 'no stay created')

    const hotel = await resolveHotelForDay(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
    })

    expect(hotel?.id).toBe(created.stayId)
    expect(hotel?.name).toBe('Linked Hotel')
  })

  it('resolves an unlinked stay via the check_in_date fallback', async () => {
    fixture = await createFixture({ date: DATE })

    // Direct insert rather than the createHotelStay action: the action always
    // derives and writes a link once check_in_date is submitted, so an
    // unlinked-but-dated stay (the planner's shape, or one from before the
    // link existed) can only be produced this way.
    const { data: stay, error } = await testDb
      .from('hotel_stays')
      .insert({
        tour_id: fixture.tourId,
        tour_date_id: null,
        name: 'Unlinked Hotel',
        check_in_date: DATE,
      })
      .select('id')
      .single()
    if (error || !stay) throw new Error(error?.message ?? 'no stay created')

    const hotel = await resolveHotelForDay(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: DATE,
    })

    expect(hotel?.id).toBe(stay.id)
    expect(hotel?.name).toBe('Unlinked Hotel')
  })
})
