import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, createSecondTour, destroyFixture, type Fixture } from './fixture'
import { recordTransportOption, createTransportSegment } from '@/lib/actions/transport'
import { recordHotelOption, createHotelStay } from '@/lib/actions/hotels'
import { createDayEvent, updateDayEvent } from '@/lib/actions/day-events'
import { sendBroadcast, previewBroadcast } from '@/lib/actions/broadcast'

// CLAUDE.md: "RLS scopes rows by tour, it does not check that two ids in the
// same payload belong to the same tour."
//
// Every test here uses two tours on ONE account, which is the shape that
// matters. RLS passes on both, because the caller genuinely owns both, so the
// only thing standing between tour B's data and tour A's crew is an explicit
// check inside the action. Using a second account instead would prove nothing,
// because RLS would catch it before the action ran.
//
// The consequences these prevent are not abstract. An unchecked person id in
// recordTransportOption meant the boarding-pass job would send a stranger real
// travel details to a real phone number. An unchecked show id in the broadcast
// path meant tour A's crew could be told tour B's load-in.

import type { TravelOption, HotelOption } from '@/lib/logistics/types'

// Fully typed rather than cast. A cast here would switch off the compiler on
// exactly the arguments under test.
const TRAVEL_OPTION: TravelOption = {
  mode: 'flight',
  depart_at: '2026-06-14T09:00:00.000Z',
  arrive_at: '2026-06-14T11:00:00.000Z',
  carrier: 'Test Air',
  carrier_logo_url: null,
  leg_ref: 'TA123',
  transit_min: 45,
  ground_min: 30,
  door_to_site_at: '2026-06-14T12:15:00.000Z',
  feasible: true,
  book_url: 'https://example.test/book',
  ground_transit: null, // null means a car or taxi estimate rather than real transit steps
  raw: {},
}

const HOTEL_OPTION: HotelOption = {
  property: 'Test Hotel',
  address: '1 Test Street',
  tier: 'crew',
  parking_ok: true,
  early_check_in_ok: false,
  stars: 3,
  book_url: 'https://example.test/hotel',
  raw: {},
}

describe('cross-tour id checks', () => {
  let fixture: Fixture
  let other: Awaited<ReturnType<typeof createSecondTour>>

  beforeEach(async () => {
    fixture = await createFixture()
    other = await createSecondTour(fixture)
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  describe('recordTransportOption', () => {
    // Every argument except the one under test is valid, so a passing test can
    // only mean the intended check fired.
    it('accepts when every id is on the tour', async () => {
      const result = await recordTransportOption(
        fixture.tourId,
        fixture.showId,
        fixture.personId,
        TRAVEL_OPTION
      )
      expect(result.error).toBeNull()
      expect(result.segmentId).toBeTruthy()
    })

    it('rejects a person from another tour', async () => {
      const result = await recordTransportOption(
        fixture.tourId,
        fixture.showId,
        other.personId,
        TRAVEL_OPTION
      )
      expect(result.error).toBeTruthy()
      expect(result.segmentId).toBeUndefined()
    })

    it('rejects a show from another tour', async () => {
      const result = await recordTransportOption(
        fixture.tourId,
        other.showId,
        fixture.personId,
        TRAVEL_OPTION
      )
      expect(result.error).toBeTruthy()
    })

    it('writes nothing when it rejects', async () => {
      await recordTransportOption(fixture.tourId, fixture.showId, other.personId, TRAVEL_OPTION)

      const { data } = await testDb
        .from('transport_segments')
        .select('id')
        .eq('tour_id', fixture.tourId)
      expect(data ?? []).toHaveLength(0)
    })
  })

  describe('createTransportSegment', () => {
    it('rejects a tour_date from another tour', async () => {
      const result = await createTransportSegment(fixture.tourId, {
        tour_date_id: other.tourDateId,
        mode: 'ground',
        depart_at: '2026-06-14T09:00:00.000Z',
      })
      expect(result.error).toBeTruthy()
    })

    it('accepts its own tour_date', async () => {
      const result = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        depart_at: '2026-06-14T09:00:00.000Z',
      })
      expect(result.error).toBeNull()
    })
  })

  describe('hotels', () => {
    it('accepts when every id is on the tour', async () => {
      const result = await recordHotelOption(fixture.tourId, fixture.showId, HOTEL_OPTION, {
        crew_people: [fixture.personId],
        artist_people: [],
      })
      expect(result.error).toBeNull()
    })

    it('rejects a party member from another tour', async () => {
      const result = await recordHotelOption(fixture.tourId, fixture.showId, HOTEL_OPTION, {
        crew_people: [other.personId],
        artist_people: [],
      })
      expect(result.error).toBeTruthy()
    })

    it('rejects a show from another tour', async () => {
      const result = await recordHotelOption(fixture.tourId, other.showId, HOTEL_OPTION, {
        crew_people: [],
        artist_people: [],
      })
      expect(result.error).toBeTruthy()
    })

    it('rejects a tour_date from another tour on createHotelStay', async () => {
      const result = await createHotelStay(fixture.tourId, {
        tour_date_id: other.tourDateId,
        name: 'Test Hotel',
        check_in_date: fixture.date,
      })
      expect(result.error).toBeTruthy()
    })
  })

  describe('day events', () => {
    it('rejects a show from another tour on create', async () => {
      const result = await createDayEvent({
        tour_id: fixture.tourId,
        date: fixture.date,
        title: 'Press call',
        show_id: other.showId,
      })
      expect(result.error).toBeTruthy()
    })

    it('rejects a show from another tour on update', async () => {
      const created = await createDayEvent({
        tour_id: fixture.tourId,
        date: fixture.date,
        title: 'Press call',
      })
      expect(created.error).toBeNull()

      const result = await updateDayEvent(created.eventId!, { show_id: other.showId })
      expect(result.error).toBeTruthy()
    })
  })

  describe('broadcast', () => {
    it('refuses to send using another tour\'s show', async () => {
      const result = await sendBroadcast({
        tourId: fixture.tourId,
        change: { type: 'show', showId: other.showId, field: 'load_in_at' },
      })
      expect(result.error).toBeTruthy()
      expect(result.sent).toBeUndefined()
    })

    it('returns an empty preview for another tour\'s show rather than its details', async () => {
      // The leak this prevents is the message body: venue name and load-in from
      // a tour the recipients are not on.
      const preview = await previewBroadcast(fixture.tourId, {
        type: 'show',
        showId: other.showId,
        field: 'load_in_at',
      })
      expect(preview.people).toHaveLength(0)
      expect(preview.message).toBe('')
      expect(preview.message).not.toContain('Other Venue')
    })
  })
})
