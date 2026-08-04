import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 38 Part 1. Every other test in this suite goes through a server action,
// so they all pass on correct application code whether or not the composite
// foreign keys exist. If the constraint migration had silently not applied, or
// if I had misread how a composite key behaves when one of its columns is null,
// the entire suite would still be green.
//
// So these write directly through testDb, bypassing the actions, and assert on
// the database itself. This is Brief 38's own acceptance criterion, stated
// there as "a show date written without its tour_date_id must fail the
// database".
//
// Both halves are here on purpose. A constraint that rejects too much is as
// broken as one that rejects nothing, and it fails in a way nobody notices
// until a TM cannot save: the planner writes hotel stays with no tour_date_id
// at all, and that has to stay legal.
//
// Failures are asserted on the Postgres error code, not merely on "an error
// happened". A typo in a column name also produces an error, and a test that
// accepts any error passes for the wrong reason. 23503 is foreign_key_violation.

const FK_VIOLATION = '23503'

const DATE = '2030-06-14'
const NEXT_DAY = '2030-06-15'

describe('the database refuses a desynced day link', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function addDay(date: string) {
    const { data, error } = await testDb
      .from('tour_dates')
      .insert({ tour_id: fixture.tourId, date, day_type: 'day_off' })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not add the day: ${error?.message}`)
    return data.id
  }

  describe('shows', () => {
    it('rejects a date written without its tour_date_id', async () => {
      await addDay(NEXT_DAY)

      // Exactly what updateShow did before Brief 36 Part 1, and what any future
      // code path that forgets the link would do.
      const { error } = await testDb
        .from('shows')
        .update({ date: NEXT_DAY })
        .eq('id', fixture.showId)

      expect(error?.code).toBe(FK_VIOLATION)

      const { data: show } = await testDb
        .from('shows')
        .select('date, tour_date_id')
        .eq('id', fixture.showId)
        .single()

      expect(show?.date).toBe(DATE)
      expect(show?.tour_date_id).toBe(fixture.tourDateId)
    })

    it('accepts the date and the link written together', async () => {
      const newDayId = await addDay(NEXT_DAY)

      const { error } = await testDb
        .from('shows')
        .update({ date: NEXT_DAY, tour_date_id: newDayId })
        .eq('id', fixture.showId)

      expect(error).toBeNull()
    })

    it('drags the show with the day when a day is redated', async () => {
      // on update cascade. Nothing edits tour_dates.date today, so this asserts
      // a property rather than a behaviour, and it is the groundwork for a
      // "Move day" action: the show follows its day instead of the write being
      // rejected.
      const { error } = await testDb
        .from('tour_dates')
        .update({ date: NEXT_DAY })
        .eq('id', fixture.tourDateId)

      expect(error).toBeNull()

      const { data: show } = await testDb
        .from('shows')
        .select('date, tour_date_id')
        .eq('id', fixture.showId)
        .single()

      expect(show?.date).toBe(NEXT_DAY)
      expect(show?.tour_date_id).toBe(fixture.tourDateId)
    })

    it('still deletes the show when its day is deleted', async () => {
      // on delete cascade, unchanged from the single-column key Brief 19 wrote.
      // Asserted because replacing a foreign key is a chance to lose its
      // delete behaviour without noticing.
      const { error } = await testDb.from('tour_dates').delete().eq('id', fixture.tourDateId)
      expect(error).toBeNull()

      const { data: show } = await testDb
        .from('shows')
        .select('id')
        .eq('id', fixture.showId)
        .maybeSingle()

      expect(show).toBeNull()
    })
  })

  describe('hotel stays', () => {
    async function linkedStay() {
      const { data, error } = await testDb
        .from('hotel_stays')
        .insert({
          tour_id: fixture.tourId,
          tour_date_id: fixture.tourDateId,
          check_in_date: DATE,
          name: 'Test Hotel',
          status: 'planned',
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`could not create the stay: ${error?.message}`)
      return data.id
    }

    it('rejects a check-in date written without its tour_date_id', async () => {
      await addDay(NEXT_DAY)
      const stayId = await linkedStay()

      const { error } = await testDb
        .from('hotel_stays')
        .update({ check_in_date: NEXT_DAY })
        .eq('id', stayId)

      expect(error?.code).toBe(FK_VIOLATION)
    })

    it('still allows a stay with no day link at all', async () => {
      // The planner writes check_in_date and no tour_date_id. A composite key
      // is not checked when one of its columns is null, which is the behaviour
      // this table needs and the one most likely to have been misread. If this
      // fails, the constraint is stricter than intended and the planner is
      // broken.
      const { error } = await testDb.from('hotel_stays').insert({
        tour_id: fixture.tourId,
        check_in_date: '2031-01-01',
        name: 'Planner Hotel',
        status: 'planned',
      })

      expect(error).toBeNull()
    })

    it('unlinks a stay when its day is deleted without wiping the check-in date', async () => {
      // The most important assertion in this file. A plain `on delete set null`
      // nulls every column in the key, which would erase check_in_date and lose
      // TM data silently: the exact class Brief 36 and Brief 37 exist to stop.
      // The migration restricts it to the link with `set null (tour_date_id)`,
      // which needs Postgres 15 or later. If the database were older, or the
      // column list were ignored, check_in_date would come back null here.
      const stayId = await linkedStay()

      const { error } = await testDb.from('tour_dates').delete().eq('id', fixture.tourDateId)
      expect(error).toBeNull()

      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('tour_date_id, check_in_date, name')
        .eq('id', stayId)
        .single()

      expect(stay?.tour_date_id).toBeNull()
      expect(stay?.check_in_date).toBe(DATE)
      expect(stay?.name).toBe('Test Hotel')
    })
  })
})
