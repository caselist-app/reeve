import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateShow, updateDaySheet } from '@/lib/actions/shows'
import { createHotelStay, updateHotelStay } from '@/lib/actions/hotels'
import { createTransportSegment, updateTransportSegment } from '@/lib/actions/transport'

// Brief 36 Part 1 follow-up. Part 1's fix is what makes this necessary: a record
// that moves to another day now correctly disappears from the day the TM is
// looking at, and nothing said where it went.
//
// These tests are about what the action reports, not about where the row landed
// (day-link.test.ts covers that). Two things are being pinned down:
//
//   1. A move is announced, with the day it landed on, whether that day had to be
//      created, and whether a show's day-sheet times came with it. Only the server
//      knows the last two, so the client must not be left to guess.
//   2. An edit that moves nothing announces nothing. This is the rule the whole
//      feature rests on: these actions are called constantly for edits that move
//      nothing, and a toast on all of them trains the TM to dismiss toasts without
//      reading, at which point the one that matters is invisible too. A test that
//      only checked the positive case would let that regress silently.

const DATE = '2030-06-14'
const NEXT_DAY = '2030-06-15'

describe('a move is reported back to the TM', () => {
  let fixture: Fixture

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // Every field showSchema requires, so a rejected parse can never be the reason
  // a test passes. Only the date differs between calls.
  function showPayload(date: string) {
    return { date, venue_name: 'Test Venue' }
  }

  describe('moving a show', () => {
    beforeEach(async () => {
      fixture = await createFixture({ date: DATE })
    })

    it('reports the day it moved to and that the day was added to the tour', async () => {
      const result = await updateShow(fixture.showId, showPayload(NEXT_DAY))

      expect(result.error).toBeNull()
      expect(result.moved).toEqual({
        tourId: fixture.tourId,
        date: NEXT_DAY,
        dayCreated: true,
        // The fixture's day sheet exists with every column null, which is exactly
        // what create_show_with_dependents leaves behind, so a show moved before
        // any times were entered must not claim times moved with it.
        carriedTimes: false,
      })
    })

    it('reports that the times came too, once there are times to carry', async () => {
      const seeded = await updateDaySheet(fixture.showId, { load_in: '10:00', doors: '19:00' })
      expect(seeded.error).toBeNull()

      const result = await updateShow(fixture.showId, showPayload(NEXT_DAY))

      expect(result.moved?.carriedTimes).toBe(true)
    })

    it('does not claim the day was added when the day was already on the tour', async () => {
      const { error: dayError } = await testDb
        .from('tour_dates')
        .insert({ tour_id: fixture.tourId, date: NEXT_DAY, day_type: 'day_off' })
      if (dayError) throw new Error(`could not create the target day: ${dayError.message}`)

      const result = await updateShow(fixture.showId, showPayload(NEXT_DAY))

      expect(result.moved?.date).toBe(NEXT_DAY)
      expect(result.moved?.dayCreated).toBe(false)
    })

    it('reports no move when the edit changed something other than the date', async () => {
      const result = await updateShow(fixture.showId, {
        ...showPayload(DATE),
        venue_name: 'Renamed Venue',
      })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })
  })

  describe('moving a hotel stay', () => {
    let stayId: string

    beforeEach(async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Test Hotel',
        check_in_date: DATE,
        check_out_date: DATE,
      })
      // Thrown rather than asserted: an undefined id would make the assertions
      // below pass for the wrong reason.
      if (created.error || !created.stayId) throw new Error(created.error ?? 'no stay created')
      stayId = created.stayId
    })

    it('reports the check-in day it moved to', async () => {
      const result = await updateHotelStay(stayId, {
        check_in_date: NEXT_DAY,
        check_out_date: NEXT_DAY,
      })

      expect(result.error).toBeNull()
      expect(result.moved).toEqual({
        tourId: fixture.tourId,
        date: NEXT_DAY,
        dayCreated: true,
        carriedTimes: false,
      })
    })

    it('reports no move when the form submitted the same check-in date it already had', async () => {
      // updateHotelStay recomputes the link whenever check_in_date is submitted at
      // all, even unchanged, because that is what repairs a planner-created stay
      // that has a date and no link. Comparing links rather than dates would
      // report that repair as a move and tell the TM their hotel went to the day
      // it was already on.
      const result = await updateHotelStay(stayId, {
        check_in_date: DATE,
        check_out_date: DATE,
      })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })

    it('reports no move when the form never submitted a date', async () => {
      const result = await updateHotelStay(stayId, { wifi_password: 'hunter2' })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })

    it('reports nothing when the TM clears the check-in date, because there is no day to link to', async () => {
      const result = await updateHotelStay(stayId, { check_in_date: null })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })

    it('reports the day when a stay is added for a date other than the one the form was opened from', async () => {
      // The add flow is the worse half of the problem: the panel closes on
      // success and the timeline is unchanged, so without this the TM's only
      // reading is that the app dropped the record.
      const created = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Later Hotel',
        check_in_date: NEXT_DAY,
        check_out_date: NEXT_DAY,
      })

      expect(created.error).toBeNull()
      expect(created.moved).toEqual({
        tourId: fixture.tourId,
        date: NEXT_DAY,
        dayCreated: true,
        carriedTimes: false,
      })
    })

    it('reports nothing when a stay is added for the day the form was opened from', async () => {
      const created = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Same Day Hotel',
        check_in_date: DATE,
        check_out_date: DATE,
      })

      expect(created.error).toBeNull()
      expect(created.moved).toBeNull()
    })
  })

  describe('moving a transport segment', () => {
    // Returns the id rather than the result, so the tests below need no non-null
    // assertion. A `!` on a test argument switches off the compiler on the thing
    // under test, the same way a cast does.
    async function seedSegment(departAt: string): Promise<string> {
      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'flight',
        origin: 'LHR',
        destination: 'CDG',
        depart_at: departAt,
      })
      if (created.error || !created.segmentId) throw new Error(created.error ?? 'no segment created')
      return created.segmentId
    }

    it('reports the day it moved to', async () => {
      fixture = await createFixture({ date: DATE })
      const segmentId = await seedSegment(`${DATE}T09:00:00.000Z`)

      const result = await updateTransportSegment(segmentId, {
        depart_at: `${NEXT_DAY}T09:00:00.000Z`,
      })

      expect(result.error).toBeNull()
      expect(result.moved).toEqual({
        tourId: fixture.tourId,
        date: NEXT_DAY,
        dayCreated: true,
        carriedTimes: false,
      })
    })

    it('reports no move when the departure time changed but the tour-local day did not', async () => {
      // This is the case a UTC comparison gets wrong, and transport is the one
      // record type with no database constraint holding its link and its date
      // together. In Auckland both of these instants are the 15th locally, so
      // nothing moved and nothing should be announced, even though the two UTC
      // dates differ.
      fixture = await createFixture({ date: NEXT_DAY, timezone: 'Pacific/Auckland' })
      const segmentId = await seedSegment(`${DATE}T20:00:00.000Z`)

      const result = await updateTransportSegment(segmentId, {
        depart_at: `${DATE}T22:00:00.000Z`,
      })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })

    it('reports no move when the form submitted no departure at all', async () => {
      // The booking-reference control sends that one field alone.
      fixture = await createFixture({ date: DATE })
      const segmentId = await seedSegment(`${DATE}T09:00:00.000Z`)

      const result = await updateTransportSegment(segmentId, {
        booking_reference: 'ABC123',
      })

      expect(result.error).toBeNull()
      expect(result.moved).toBeNull()
    })

    it('reports the day when a segment is added for a date other than the one the form was opened from', async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'rail',
        origin: 'Paris',
        destination: 'Lyon',
        depart_at: `${NEXT_DAY}T09:00:00.000Z`,
      })

      expect(created.error).toBeNull()
      expect(created.moved).toEqual({
        tourId: fixture.tourId,
        date: NEXT_DAY,
        dayCreated: true,
        carriedTimes: false,
      })
    })

    it('reports nothing when a segment is added for the day the form was opened from', async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        origin: 'Hotel',
        destination: 'Venue',
        depart_at: `${DATE}T09:00:00.000Z`,
      })

      expect(created.error).toBeNull()
      expect(created.moved).toBeNull()
    })
  })
})
