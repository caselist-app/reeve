import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { recordTransportOption } from '@/lib/actions/transport'
import type { TravelOption } from '@/lib/logistics/types'

// REE-158: recordTransportOption used to write no tour_date_id at all, on the
// stated assumption that the unlinked date-match query in fetchDayRecords
// would still find the segment on its departure day. That is only true when
// the departure's date already has a tour_dates row from something else. A
// planner-booked option departing the evening before the first show, with
// nothing else on that date yet, had no row for fetchDayRecords to even query
// against: it returns nothing for a date with no tour_dates row before it
// looks at transport at all. Same rule as createTransportSegment now:
// resolve, and create if needed.

const TZ = 'Europe/London'

function travelOptionAt(departAt: string, arriveAt: string): TravelOption {
  return {
    mode: 'flight',
    depart_at: departAt,
    arrive_at: arriveAt,
    carrier: 'Test Air',
    carrier_logo_url: null,
    leg_ref: 'TA123',
    transit_min: 45,
    ground_min: 30,
    door_to_site_at: arriveAt,
    feasible: true,
    book_url: 'https://example.test/book',
    ground_transit: null,
    raw: {},
  }
}

describe('recordTransportOption resolves the departure day (REE-158)', () => {
  let fixture: Fixture

  beforeEach(async () => {
    // The fixture's own tour_date is the 14th. A departure the evening before
    // has no tour_dates row to land on until this call creates one.
    fixture = await createFixture({ date: '2026-06-14', timezone: TZ })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('creates the day off tour_dates when the departure lands on a date the tour has nothing else on', async () => {
    // 20:00 BST on the 13th.
    const result = await recordTransportOption(
      fixture.tourId,
      fixture.showId,
      fixture.personId,
      travelOptionAt('2026-06-13T19:00:00.000Z', '2026-06-14T08:46:00.000Z')
    )
    expect(result.error).toBeNull()

    const { data: segment } = await testDb
      .from('transport_segments')
      .select('tour_date_id')
      .eq('id', result.segmentId!)
      .single()
    expect(segment?.tour_date_id).not.toBeNull()

    const { data: departureDay } = await testDb
      .from('tour_dates')
      .select('id, day_type')
      .eq('tour_id', fixture.tourId)
      .eq('date', '2026-06-13')
      .maybeSingle()

    expect(departureDay).not.toBeNull()
    expect(departureDay?.day_type).toBe('travel')
    expect(segment?.tour_date_id).toBe(departureDay?.id)
  })

  it('creates the arrival day as a travel day when it breaks over into a date the tour has no row for (REE-161)', async () => {
    // Departs the fixture's own day (the 14th), arrives past midnight local on
    // the 15th, which has no tour_dates row of its own.
    const result = await recordTransportOption(
      fixture.tourId,
      fixture.showId,
      fixture.personId,
      travelOptionAt('2026-06-14T22:00:00.000Z', '2026-06-15T01:00:00.000Z')
    )
    expect(result.error).toBeNull()

    const { data: segment } = await testDb
      .from('transport_segments')
      .select('tour_date_id')
      .eq('id', result.segmentId!)
      .single()
    // The segment stays linked to its departure day.
    expect(segment?.tour_date_id).toBe(fixture.tourDateId)

    const { data: arrivalDay } = await testDb
      .from('tour_dates')
      .select('id, day_type')
      .eq('tour_id', fixture.tourId)
      .eq('date', '2026-06-15')
      .maybeSingle()

    expect(arrivalDay).not.toBeNull()
    expect(arrivalDay?.day_type).toBe('travel')
  })

  it('links to the existing day rather than creating a duplicate when one already covers the departure', async () => {
    const result = await recordTransportOption(
      fixture.tourId,
      fixture.showId,
      fixture.personId,
      // Same date as the fixture's own show day.
      travelOptionAt('2026-06-14T09:00:00.000Z', '2026-06-14T11:00:00.000Z')
    )
    expect(result.error).toBeNull()

    const { data: segment } = await testDb
      .from('transport_segments')
      .select('tour_date_id')
      .eq('id', result.segmentId!)
      .single()
    expect(segment?.tour_date_id).toBe(fixture.tourDateId)

    const { data: dates } = await testDb
      .from('tour_dates')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('date', '2026-06-14')
    expect(dates).toHaveLength(1)
  })
})
