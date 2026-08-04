import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateShow, updateDaySheet } from '@/lib/actions/shows'
import { updateHotelStay } from '@/lib/actions/hotels'
import { updateTransportSegment, createTransportSegment } from '@/lib/actions/transport'
import { createHotelStay } from '@/lib/actions/hotels'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { renderItinerary } from '@/lib/comms/templates/itinerary'

// Brief 36 Part 1. Brief 19 made tour_dates the spine and retrofitted a
// tour_date_id link onto records that already stored their own date. Every add
// path was updated to write both. No edit path was. So editing a date desyncs
// the record from the day the schedule reads it by.
//
// The three record types fail in opposite directions from that one cause, and
// that is why every test here asserts both halves:
//
//   shows      the schedule keeps the show on the old day while /itinerary and
//              the morning message move to the new one
//   hotels     the day query is date-guarded on render, so an edited stay is
//              rejected by the old day and excluded from the new one, and shows
//              on no day at all
//   transport  the day query has no date guard, so an edited segment stays put
//              and displays a time belonging to a different date
//
// A test that only asks "did it move" catches the hotel and misses the flight.
// Every case therefore asserts presence on the new day AND absence from the old.

// Far enough out that renderItinerary's "next upcoming show" window cannot
// expire and turn a real assertion into "No upcoming shows on this tour."
const DATE = '2030-06-14'
const NEXT_DAY = '2030-06-15'

// renderItinerary takes person_id but never reads it: the show lookup is scoped
// by tour_id alone. Passed as a well-formed uuid so the argument is valid, not
// because the assertion depends on it.
const UNUSED_PERSON_ID = '00000000-0000-0000-0000-0000000000ff'

describe('the day link survives an edit', () => {
  let fixture: Fixture

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function tourDateFor(date: string) {
    const { data } = await testDb
      .from('tour_dates')
      .select('id, date, day_type')
      .eq('tour_id', fixture.tourId)
      .eq('date', date)
      .maybeSingle()
    return data
  }

  // What the schedule day view actually renders for a date. Off-calendar dates
  // (no tour_dates row) render no timeline at all, which is what the null
  // tourDateId branch of fetchDayRecords returns.
  async function dayRecords(date: string) {
    const day = await tourDateFor(date)
    return fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: day?.id ?? null,
      date,
    })
  }

  // Every field showSchema requires, so a rejected parse can never be the
  // reason a test passes. Only the date differs between calls.
  function showPayload(date: string) {
    return { date, venue_name: 'Test Venue' }
  }

  describe('moving a show to another date', () => {
    beforeEach(async () => {
      fixture = await createFixture({ date: DATE })
    })

    it('repoints tour_date_id at the new day and creates that day if it is missing', async () => {
      expect(await tourDateFor(NEXT_DAY)).toBeNull()

      const result = await updateShow(fixture.showId, showPayload(NEXT_DAY))
      expect(result.error).toBeNull()

      const newDay = await tourDateFor(NEXT_DAY)
      expect(newDay).not.toBeNull()
      expect(newDay?.day_type).toBe('show')

      const { data: show } = await testDb
        .from('shows')
        .select('date, tour_date_id')
        .eq('id', fixture.showId)
        .single()

      expect(show?.date).toBe(NEXT_DAY)
      expect(show?.tour_date_id).toBe(newDay?.id)
    })

    it('moves the show on the schedule instead of leaving it on the old day', async () => {
      await updateShow(fixture.showId, showPayload(NEXT_DAY))

      const after = await dayRecords(NEXT_DAY)
      expect(after.shows.map((s) => s.id)).toEqual([fixture.showId])

      const before = await dayRecords(DATE)
      expect(before.shows).toHaveLength(0)
    })

    it('carries the day sheet times onto the new date, so /itinerary and the timeline agree', async () => {
      // The times a TM would have entered before realising the date was wrong.
      const seeded = await updateDaySheet(fixture.showId, {
        venue_access: '09:00',
        load_in: '10:00',
        soundcheck: '15:00',
        doors: '19:00',
      })
      expect(seeded.error).toBeNull()

      const moved = await updateShow(fixture.showId, showPayload(NEXT_DAY))
      expect(moved.error).toBeNull()

      const { data: sheet } = await testDb
        .from('day_sheets')
        .select('venue_access, load_in, soundcheck, doors')
        .eq('show_id', fixture.showId)
        .single()

      // Stored as timestamptz derived from the show's date. Every populated one
      // has to land on the new day, or the timeline renders the show on the
      // 15th with times belonging to the 14th.
      for (const value of [sheet?.venue_access, sheet?.load_in, sheet?.soundcheck, sheet?.doors]) {
        expect(value).not.toBeNull()
        expect(new Date(value as string).toISOString().slice(0, 10)).toBe(NEXT_DAY)
      }

      // The same fields as the crew see them. Asserting the day rather than the
      // rendered weekday, so this does not encode a date calculation of its own.
      const itinerary = await renderItinerary(UNUSED_PERSON_ID, fixture.tourId)
      expect(itinerary).toContain('15 Jun')
      expect(itinerary).not.toContain('14 Jun')
    })

    it('does not leave the old day labelled as a show day', async () => {
      await updateShow(fixture.showId, showPayload(NEXT_DAY))

      const oldDay = await tourDateFor(DATE)
      expect(oldDay?.day_type).not.toBe('show')
    })

    it('leaves the link alone when the date did not change', async () => {
      const before = await tourDateFor(DATE)

      const result = await updateShow(fixture.showId, {
        ...showPayload(DATE),
        venue_name: 'Renamed Venue',
      })
      expect(result.error).toBeNull()

      const { data: show } = await testDb
        .from('shows')
        .select('date, tour_date_id, venue_name')
        .eq('id', fixture.showId)
        .single()

      expect(show?.venue_name).toBe('Renamed Venue')
      expect(show?.date).toBe(DATE)
      expect(show?.tour_date_id).toBe(before?.id)
      expect((await tourDateFor(DATE))?.day_type).toBe('show')
    })
  })

  describe('moving a hotel stay to another date', () => {
    let stayId: string

    beforeEach(async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Test Hotel',
        check_in_date: DATE,
        check_out_date: DATE,
      })
      if (created.error || !created.stayId) throw new Error(created.error ?? 'no stay created')
      stayId = created.stayId
    })

    it('appears on the new day and disappears from the old one', async () => {
      const result = await updateHotelStay(stayId, {
        check_in_date: NEXT_DAY,
        check_out_date: NEXT_DAY,
      })
      expect(result.error).toBeNull()

      // This is the case that renders on no day at all today: the old day's
      // linked query finds it and the date guard rejects it, while the new day's
      // fallback excludes it for having a link.
      const after = await dayRecords(NEXT_DAY)
      expect(after.hotels.map((h) => h.id)).toContain(stayId)

      const before = await dayRecords(DATE)
      expect(before.hotels.map((h) => h.id)).not.toContain(stayId)
    })

    it('repoints tour_date_id at the check-in day', async () => {
      await updateHotelStay(stayId, { check_in_date: NEXT_DAY, check_out_date: NEXT_DAY })

      const newDay = await tourDateFor(NEXT_DAY)
      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('tour_date_id, check_in_date')
        .eq('id', stayId)
        .single()

      expect(stay?.check_in_date).toBe(NEXT_DAY)
      expect(stay?.tour_date_id).toBe(newDay?.id)
    })

    it('renders a check-out card on the check-out day of a linked multi-night stay', async () => {
      const result = await updateHotelStay(stayId, { check_out_date: NEXT_DAY })
      expect(result.error).toBeNull()

      const checkinDay = await dayRecords(DATE)
      expect(checkinDay.hotels.find((h) => h.id === stayId)?.isCheckout).toBe(false)

      // A linked stay is only ever fetched for its own tour_date_id, so the
      // check-out day never sees it today.
      const checkoutDay = await dayRecords(NEXT_DAY)
      expect(checkoutDay.hotels.find((h) => h.id === stayId)?.isCheckout).toBe(true)
    })

    it('clears the link when the TM clears the check-in date', async () => {
      // null means cleared and must be written. undefined means the form never
      // sent it and the stored value must survive. The test below covers the
      // other half.
      const result = await updateHotelStay(stayId, { check_in_date: null })
      expect(result.error).toBeNull()

      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('tour_date_id, check_in_date, name')
        .eq('id', stayId)
        .single()

      expect(stay?.check_in_date).toBeNull()
      expect(stay?.tour_date_id).toBeNull()
      expect(stay?.name).toBe('Test Hotel')
    })

    it('adding a stay for another date puts it on that date, not the day the form was opened from', async () => {
      // The Add Hotel form defaults its check-in date to the day the TM is on
      // and then lets them change it, while always passing that day's
      // tour_date_id. Once the composite key lands, a mismatch is a foreign key
      // violation the TM sees rather than a silent one.
      const created = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Later Hotel',
        check_in_date: NEXT_DAY,
        check_out_date: NEXT_DAY,
      })
      // Thrown rather than asserted: a later `not.toContain(undefined)` would
      // pass on an undefined id, which is a test passing for the wrong reason.
      if (created.error || !created.stayId) throw new Error(created.error ?? 'no stay created')

      const newDay = await tourDateFor(NEXT_DAY)
      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('tour_date_id')
        .eq('id', created.stayId)
        .single()
      expect(stay?.tour_date_id).toBe(newDay?.id)

      const after = await dayRecords(NEXT_DAY)
      expect(after.hotels.map((h) => h.id)).toContain(created.stayId)

      const before = await dayRecords(DATE)
      expect(before.hotels.map((h) => h.id)).not.toContain(created.stayId)
    })

    it('leaves the date and the link alone when the form did not submit a date', async () => {
      const result = await updateHotelStay(stayId, { wifi_password: 'hunter2' })
      expect(result.error).toBeNull()

      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('tour_date_id, check_in_date, wifi_password')
        .eq('id', stayId)
        .single()

      expect(stay?.wifi_password).toBe('hunter2')
      expect(stay?.check_in_date).toBe(DATE)
      expect(stay?.tour_date_id).toBe(fixture.tourDateId)
    })
  })

  describe('moving a transport segment to another day', () => {
    it('moves the segment instead of leaving it on the old day showing the new time', async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'flight',
        origin: 'LHR',
        destination: 'CDG',
        depart_at: `${DATE}T09:00:00.000Z`,
      })
      if (created.error || !created.segmentId) throw new Error(created.error ?? 'no segment created')

      const result = await updateTransportSegment(created.segmentId, {
        depart_at: `${NEXT_DAY}T09:00:00.000Z`,
      })
      expect(result.error).toBeNull()

      const newDay = await tourDateFor(NEXT_DAY)
      const { data: segment } = await testDb
        .from('transport_segments')
        .select('tour_date_id')
        .eq('id', created.segmentId)
        .single()
      expect(segment?.tour_date_id).toBe(newDay?.id)

      const after = await dayRecords(NEXT_DAY)
      expect(after.segments.map((s) => s.id)).toContain(created.segmentId)

      // The failure mode here is the opposite of the hotel one: without a date
      // guard the old day still returns it, sorted by a key from another date.
      const before = await dayRecords(DATE)
      expect(before.segments.map((s) => s.id)).not.toContain(created.segmentId)
    })

    it('uses the tour timezone, not UTC, to decide which day a departure falls on', async () => {
      // 22:00Z on the 14th is 10:00 on the 15th in Auckland. A UTC-boundary day
      // window puts this segment on the 14th, which is not the day the TM or the
      // crew member is looking at.
      fixture = await createFixture({ date: DATE, timezone: 'Pacific/Auckland' })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        origin: 'Hotel',
        destination: 'Venue',
        depart_at: `${DATE}T09:00:00.000Z`,
      })
      if (created.error || !created.segmentId) throw new Error(created.error ?? 'no segment created')

      const result = await updateTransportSegment(created.segmentId, {
        depart_at: `${DATE}T22:00:00.000Z`,
      })
      expect(result.error).toBeNull()

      const newDay = await tourDateFor(NEXT_DAY)
      expect(newDay).not.toBeNull()

      const { data: segment } = await testDb
        .from('transport_segments')
        .select('tour_date_id')
        .eq('id', created.segmentId)
        .single()
      expect(segment?.tour_date_id).toBe(newDay?.id)

      const after = await dayRecords(NEXT_DAY)
      expect(after.segments.map((s) => s.id)).toContain(created.segmentId)

      const before = await dayRecords(DATE)
      expect(before.segments.map((s) => s.id)).not.toContain(created.segmentId)
    })

    it('adding a segment for another date puts it on that date, not the day the form was opened from', async () => {
      // Every add form defaults its datetime-local to the current day and then
      // lets the TM edit it, and the flight search flow has a date step of its
      // own, so a create can produce the same mismatch an edit used to. The day
      // view is date-guarded now, so getting this wrong hides the segment
      // entirely rather than putting it on the wrong day.
      fixture = await createFixture({ date: DATE })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'rail',
        origin: 'Paris',
        destination: 'Lyon',
        depart_at: `${NEXT_DAY}T09:00:00.000Z`,
      })
      // Thrown rather than asserted: a later `not.toContain(undefined)` would
      // pass on an undefined id, which is a test passing for the wrong reason.
      if (created.error || !created.segmentId) throw new Error(created.error ?? 'no segment created')

      const newDay = await tourDateFor(NEXT_DAY)
      expect(newDay).not.toBeNull()

      const after = await dayRecords(NEXT_DAY)
      expect(after.segments.map((s) => s.id)).toContain(created.segmentId)

      const before = await dayRecords(DATE)
      expect(before.segments.map((s) => s.id)).not.toContain(created.segmentId)
    })

    it('leaves the link alone when the form did not submit a departure time', async () => {
      fixture = await createFixture({ date: DATE })

      const created = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'flight',
        depart_at: `${DATE}T09:00:00.000Z`,
      })
      if (created.error || !created.segmentId) throw new Error(created.error ?? 'no segment created')

      const result = await updateTransportSegment(created.segmentId, {
        booking_reference: 'ABC123',
      })
      expect(result.error).toBeNull()

      const { data: segment } = await testDb
        .from('transport_segments')
        .select('tour_date_id, depart_at, booking_reference')
        .eq('id', created.segmentId)
        .single()

      expect(segment?.booking_reference).toBe('ABC123')
      expect(segment?.depart_at).not.toBeNull()
      expect(segment?.tour_date_id).toBe(fixture.tourDateId)
    })
  })
})
