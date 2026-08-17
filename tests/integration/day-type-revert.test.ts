import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { revertDayTypeIfOrphaned } from '@/lib/schedule/day-type-revert'

// revertDayTypeIfOrphaned runs after a show or rehearsal (the entity that
// defines a day's type) is removed, so tour_dates.day_type never points at
// something that no longer exists. It is guarded twice: it only reverts a
// day_type that still equals the removedType (someone may have already
// changed it via another path), and it only reverts when nothing of
// removedType remains linked to the day (a day can carry two shows, or a
// show can have just been moved onto it). Both guards get their own case
// here, alongside both fallback values (day_off, travel) and the rehearsal
// branch of the table lookup.

// Far enough out it cannot collide with any other suite's date-based
// assertions, matching day-link.test.ts's convention.
const DATE = '2030-06-14'

describe('revertDayTypeIfOrphaned', () => {
  let fixture: Fixture

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function tourDate(id: string) {
    const { data } = await testDb
      .from('tour_dates')
      .select('day_type, custom_title')
      .eq('id', id)
      .single()
    return data
  }

  describe('a show day with the show removed', () => {
    it('reverts to day_off and clears the custom title when nothing is linked', async () => {
      fixture = await createFixture({ date: DATE })

      const { error: titleError } = await testDb
        .from('tour_dates')
        .update({ custom_title: 'Old Show Title' })
        .eq('id', fixture.tourDateId)
      if (titleError) throw new Error(`could not seed custom_title: ${titleError.message}`)

      const { error: deleteError } = await testDb.from('shows').delete().eq('id', fixture.showId)
      if (deleteError) throw new Error(`could not delete seeded show: ${deleteError.message}`)

      const { data: segment } = await testDb
        .from('transport_segments')
        .select('id')
        .eq('tour_date_id', fixture.tourDateId)
        .maybeSingle()
      expect(segment).toBeNull()

      await revertDayTypeIfOrphaned(testDb, fixture.tourDateId, 'show')

      const after = await tourDate(fixture.tourDateId)
      expect(after?.day_type).toBe('day_off')
      expect(after?.custom_title).toBeNull()
    })

    it('reverts to travel instead of day_off when a transport segment is linked to the day', async () => {
      fixture = await createFixture({ date: DATE })

      const { error: deleteError } = await testDb.from('shows').delete().eq('id', fixture.showId)
      if (deleteError) throw new Error(`could not delete seeded show: ${deleteError.message}`)

      const { error: segmentError } = await testDb
        .from('transport_segments')
        .insert({ tour_id: fixture.tourId, tour_date_id: fixture.tourDateId, mode: 'ground' })
      if (segmentError) throw new Error(`could not insert segment: ${segmentError.message}`)

      await revertDayTypeIfOrphaned(testDb, fixture.tourDateId, 'show')

      const after = await tourDate(fixture.tourDateId)
      expect(after?.day_type).toBe('travel')
    })

    it('does not revert when day_type no longer matches removedType, because something else already changed it', async () => {
      fixture = await createFixture({ date: DATE })

      const { error: deleteError } = await testDb.from('shows').delete().eq('id', fixture.showId)
      if (deleteError) throw new Error(`could not delete seeded show: ${deleteError.message}`)

      const { error: retypeError } = await testDb
        .from('tour_dates')
        .update({ day_type: 'press' })
        .eq('id', fixture.tourDateId)
      if (retypeError) throw new Error(`could not retype tour_date: ${retypeError.message}`)

      await revertDayTypeIfOrphaned(testDb, fixture.tourDateId, 'show')

      const after = await tourDate(fixture.tourDateId)
      expect(after?.day_type).toBe('press')
    })

    it('does not revert when another show is still linked to the day', async () => {
      fixture = await createFixture({ date: DATE })

      // The fixture's seeded show is left in place: a second show is inserted
      // on the same day, so the day carries two shows and neither one being
      // "removed" (in the sense this function is called for) should touch
      // day_type, because the orphan check finds the seeded show still there.
      const { error: secondShowError } = await testDb.from('shows').insert({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        date: DATE,
        venue_name: 'Second Venue',
      })
      if (secondShowError) throw new Error(`could not insert second show: ${secondShowError.message}`)

      await revertDayTypeIfOrphaned(testDb, fixture.tourDateId, 'show')

      const after = await tourDate(fixture.tourDateId)
      expect(after?.day_type).toBe('show')
    })
  })

  describe('a rehearsal day with the rehearsal removed', () => {
    it('reverts to day_off once the last rehearsal linked to the day is gone', async () => {
      fixture = await createFixture({ date: DATE })

      const { data: rehearsalDay, error: dayError } = await testDb
        .from('tour_dates')
        .insert({ tour_id: fixture.tourId, date: '2030-06-15', day_type: 'rehearsal' })
        .select('id')
        .single()
      if (dayError || !rehearsalDay) {
        throw new Error(`could not create rehearsal day: ${dayError?.message}`)
      }

      const { data: rehearsal, error: rehearsalError } = await testDb
        .from('rehearsals')
        .insert({
          tour_id: fixture.tourId,
          tour_date_id: rehearsalDay.id,
          location_name: 'Test Rehearsal Room',
        })
        .select('id')
        .single()
      if (rehearsalError || !rehearsal) {
        throw new Error(`could not create rehearsal: ${rehearsalError?.message}`)
      }

      const { error: deleteError } = await testDb.from('rehearsals').delete().eq('id', rehearsal.id)
      if (deleteError) throw new Error(`could not delete rehearsal: ${deleteError.message}`)

      await revertDayTypeIfOrphaned(testDb, rehearsalDay.id, 'rehearsal')

      const after = await tourDate(rehearsalDay.id)
      expect(after?.day_type).toBe('day_off')
    })
  })
})
