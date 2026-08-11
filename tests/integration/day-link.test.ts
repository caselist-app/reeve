import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateShow } from '@/lib/actions/shows'
import { createDayItem } from '@/lib/actions/day-items'
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
  //
  // The timezone read is not incidental. This mirrors what
  // app/(app)/tours/[id]/schedule/page.tsx passes down, and transport is placed
  // by a tour-local day window, so a harness that omitted it would assert
  // against UTC boundaries the product never uses and fail a correct fix.
  async function dayRecords(date: string) {
    const [day, { data: tour }] = await Promise.all([
      tourDateFor(date),
      testDb.from('tours').select('timezone').eq('id', fixture.tourId).single(),
    ])

    return fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: day?.id ?? null,
      date,
      timezone: tour?.timezone ?? 'UTC',
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

    it('carries the running order onto the new date, so /itinerary and the timeline agree', async () => {
      // The times a TM would have entered before realising the date was wrong.
      for (const [kind, clock] of [
        ['venue_access', '09:00'],
        ['load_in', '10:00'],
        ['soundcheck', '15:00'],
        ['doors', '19:00'],
      ] as const) {
        const seeded = await createDayItem({
          tour_id: fixture.tourId,
          tour_date_id: fixture.tourDateId,
          show_id: fixture.showId,
          kind,
          start_clock: clock,
        })
        expect(seeded.error).toBeNull()
      }

      const moved = await updateShow(fixture.showId, showPayload(NEXT_DAY))
      expect(moved.error).toBeNull()

      const { data: items } = await testDb
        .from('day_items')
        .select('kind, tour_date_id, starts_at')
        .eq('show_id', fixture.showId)

      // Both facts move together or neither is right. The day link decides which
      // day the timeline renders it on, the instant decides what /itinerary says,
      // and Brief 19 is the bug where one moved and the other did not.
      expect(items ?? []).toHaveLength(4)

      const { data: newDay } = await testDb
        .from('tour_dates')
        .select('id')
        .eq('tour_id', fixture.tourId)
        .eq('date', NEXT_DAY)
        .single()
      if (!newDay) throw new Error('the show did not get a day to move to')

      for (const item of items ?? []) {
        expect(item.tour_date_id).toBe(newDay.id)
        expect(item.starts_at).not.toBeNull()
        expect(new Date(item.starts_at as string).toISOString().slice(0, 10)).toBe(NEXT_DAY)
      }

      // The same fields as the crew see them. Asserting the day rather than the
      // rendered weekday, so this does not encode a date calculation of its own.
      const itinerary = await renderItinerary(UNUSED_PERSON_ID, fixture.tourId)
      expect(itinerary).toContain('15 Jun')
      expect(itinerary).not.toContain('14 Jun')
    })

    it('carries items that are on the day but not linked to the show, so the whole running order follows', async () => {
      // The regression REE-118 reports. day_items hang off the day by
      // tour_date_id and only reference a show through the nullable show_id.
      // The quick-add day form and the custom-event form both create items with
      // show_id null (only email extraction and the planner set it), so a move
      // that carried items by show_id left every hand-added item, headliner
      // included, stranded on a day with no show. The item moves because it is
      // on the day, not because it names the show.
      const unlinked = await createDayItem({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        // No show_id: exactly what components/schedule/day-form.tsx sends.
        kind: 'headliner',
        start_clock: '21:00',
      })
      expect(unlinked.error).toBeNull()
      if (!unlinked.itemId) throw new Error('no item created')

      const moved = await updateShow(fixture.showId, showPayload(NEXT_DAY))
      expect(moved.error).toBeNull()

      const newDay = await tourDateFor(NEXT_DAY)
      if (!newDay) throw new Error('the show did not get a day to move to')

      const { data: item } = await testDb
        .from('day_items')
        .select('tour_date_id, show_id, starts_at')
        .eq('id', unlinked.itemId)
        .single()

      // It followed the show to the new day, keeping its unlinked show_id, and
      // its instant landed on the new date.
      expect(item?.tour_date_id).toBe(newDay.id)
      expect(item?.show_id).toBeNull()
      expect(new Date(item?.starts_at as string).toISOString().slice(0, 10)).toBe(NEXT_DAY)

      // And it is gone from the day the show left, rather than stranded on it.
      const before = await dayRecords(DATE)
      expect(before.items.map((i) => i.id)).not.toContain(unlinked.itemId)
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
      // The check-out day has to be a day of the tour before this assertion
      // means anything. The day view only renders dates that exist in
      // tour_dates, so without this the check-out day returns nothing for the
      // ordinary reason that there is no such day, and the test would pass or
      // fail for something other than what it is checking.
      //
      // Only check_out_date is submitted below, so the link stays on the
      // check-in day. That is the point: the stay must render on a day its
      // tour_date_id does not name.
      const { error: dayError } = await testDb
        .from('tour_dates')
        .insert({ tour_id: fixture.tourId, date: NEXT_DAY, day_type: 'day_off' })
      if (dayError) throw new Error(`could not create the check-out day: ${dayError.message}`)

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
      // A day that exists only because a departure landed on it is a travel day,
      // not the table's day_off default (REE-43).
      expect(newDay?.day_type).toBe('travel')

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

  // REE-113, broadcast-day grid step 2. Transport is now sourced from the
  // broadcast day, [date 04:00, date+1 04:00) in the tour timezone, not the
  // calendar day. So a 02:00 overnight drive after tonight's show, stored on the
  // next calendar date, comes back with the night it belongs to. The two fetch
  // paths fail in different ways without the change: the unlinked fallback would
  // filter it out by depart_at, and the linked date-guard would drop it as a
  // stale link, so each case is asserted on its own.
  //
  // Segments are inserted directly rather than through createTransportSegment:
  // that action derives tour_date_id from depart_at's calendar date, so it
  // cannot yet produce either state under test (an unlinked segment with a
  // departure, the planner's shape; or a segment linked to dayDate but departing
  // the next morning, which step 3's broadcast-aware create will produce). The
  // fetch's windowing is what this step changes, so the rows are set up to
  // exercise it directly.
  describe('sourcing transport from the broadcast day', () => {
    // UTC, so the broadcast window is exactly [DATE 04:00Z, NEXT_DAY 04:00Z) and
    // every departure instant below reads as the wall clock it is written as.
    beforeEach(async () => {
      fixture = await createFixture({ date: DATE, timezone: 'UTC' })
    })

    async function insertSegment(tourDateId: string | null, departAt: string) {
      const { data, error } = await testDb
        .from('transport_segments')
        .insert({ tour_id: fixture.tourId, tour_date_id: tourDateId, mode: 'ground', depart_at: departAt })
        .select('id')
        .single()
      if (error || !data) throw new Error(`could not insert segment: ${error?.message}`)
      return data.id
    }

    it('lands an unlinked 02:00 overnight drive on the night it follows', async () => {
      // No link, stored on the next calendar date, which is the planner's shape.
      // The old calendar-day fallback filtered it off DATE by depart_at.
      const id = await insertSegment(null, `${NEXT_DAY}T02:00:00.000Z`)

      const records = await dayRecords(DATE)
      expect(records.segments.map((s) => s.id)).toContain(id)
    })

    it('keeps a linked 02:00 overnight drive instead of dropping it on the date guard', async () => {
      // Linked to DATE but departing in the small hours of NEXT_DAY. The old
      // [00:00, 24:00) guard rejected this as a stale link; the broadcast window
      // keeps it, which is the change under test.
      const id = await insertSegment(fixture.tourDateId, `${NEXT_DAY}T02:00:00.000Z`)

      const records = await dayRecords(DATE)
      expect(records.segments.map((s) => s.id)).toContain(id)
    })

    it('leaves a 07:00 next-morning drive on the next broadcast day, not this one', async () => {
      // Past the 04:00 boundary, so it belongs to NEXT_DAY's night. Checked on
      // both fetch paths: the unlinked fallback and the linked date-guard.
      const unlinked = await insertSegment(null, `${NEXT_DAY}T07:00:00.000Z`)
      const linked = await insertSegment(fixture.tourDateId, `${NEXT_DAY}T07:00:00.000Z`)

      const records = await dayRecords(DATE)
      expect(records.segments.map((s) => s.id)).not.toContain(unlinked)
      expect(records.segments.map((s) => s.id)).not.toContain(linked)
    })
  })
})
