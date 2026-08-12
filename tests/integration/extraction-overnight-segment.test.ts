import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { confirmExtraction } from '@/lib/actions/extractions'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import type { ExtractionProposal } from '@/lib/ai/extract'

// REE-158: a coach booking confirmation forwarded and confirmed through the
// Inbox never had its transport_segments row's tour_date_id resolved, so a
// departure on a date with nothing else on the tour never got a tour_dates
// row of its own. The Dates sidebar only ever lists actual tour_dates rows
// (schedule-shell.ts), and fetchDayRecords returns nothing for a date with no
// row before it even queries transport, so the segment's own placement (the
// block starting at its real departure time) had no page a TM could open. It
// still surfaced on the following day's grid, through the link-blind
// continuation query added by REE-124, clamped to the grid top: a block that
// read as though the whole overnight journey started and ended within one
// day, when it was really the tail of a departure from the evening before.

const TZ = 'Europe/London'

async function seedForwardedEmail(tourId: string, proposal: ExtractionProposal) {
  const { data, error } = await testDb
    .from('forwarded_emails')
    .insert({
      tour_id: tourId,
      subject: 'Coach booking confirmation',
      extraction_status: 'extracted',
      proposed_rows: proposal,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed forwarded_emails: ${error?.message}`)
  return data.id
}

describe('an overnight segment confirmed from a forwarded email (REE-158)', () => {
  let fixture: Fixture

  beforeEach(async () => {
    // The fixture's own tour_date is the 14th (the show), which is where the
    // coach arrives. The 13th, the departure evening, does not exist as a
    // tour_dates row until confirmExtraction resolves it.
    fixture = await createFixture({ date: '2026-06-14', timezone: TZ })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('resolves and creates the departure day, rather than leaving the segment unlinked', async () => {
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId, {
      shows: [],
      transport_segments: [
        {
          mode: 'bus',
          origin: 'O2 Arena, London, UK',
          destination: '272A St Vincent St, Glasgow G2 5RL, UK',
          // 20:00 BST on the 13th to 09:46 BST on the 14th.
          depart_at: '2026-06-13T19:00:00.000Z',
          arrive_at: '2026-06-14T08:46:00.000Z',
          carrier_operator: null,
          vehicle_or_flight_no: null,
          booking_reference: null,
        },
      ],
      hotel_stays: [],
    })

    const result = await confirmExtraction(forwardedEmailId, {
      shows: [],
      transport_segments: [0],
      hotel_stays: [],
    })
    expect(result.error).toBeNull()

    const { data: segmentRow } = await testDb
      .from('transport_segments')
      .select('id, tour_date_id')
      .eq('tour_id', fixture.tourId)
      .single()
    expect(segmentRow?.tour_date_id).not.toBeNull()

    const { data: departureDay } = await testDb
      .from('tour_dates')
      .select('id, date, day_type')
      .eq('tour_id', fixture.tourId)
      .eq('date', '2026-06-13')
      .maybeSingle()

    // The departure day now exists on the tour, so it is reachable from the
    // Dates sidebar, and it is the day the segment's own link points at: a
    // date that exists only because a departure landed on it is a travel day.
    expect(departureDay).not.toBeNull()
    expect(departureDay?.day_type).toBe('travel')
    expect(segmentRow?.tour_date_id).toBe(departureDay?.id)
  })

  it('places the segment on the day it departs, and its continuation on the day it lands', async () => {
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId, {
      shows: [],
      transport_segments: [
        {
          mode: 'bus',
          origin: 'O2 Arena, London, UK',
          destination: '272A St Vincent St, Glasgow G2 5RL, UK',
          depart_at: '2026-06-13T19:00:00.000Z',
          arrive_at: '2026-06-14T08:46:00.000Z',
          carrier_operator: null,
          vehicle_or_flight_no: null,
          booking_reference: null,
        },
      ],
      hotel_stays: [],
    })

    await confirmExtraction(forwardedEmailId, {
      shows: [],
      transport_segments: [0],
      hotel_stays: [],
    })

    const { data: segmentRow } = await testDb
      .from('transport_segments')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .single()
    if (!segmentRow) throw new Error('segment did not write')

    const { data: departureDay } = await testDb
      .from('tour_dates')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('date', '2026-06-13')
      .single()
    if (!departureDay) throw new Error('departure day was not created')

    const departureRecords = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: departureDay.id,
      date: '2026-06-13',
      timezone: TZ,
    })
    // The segment's own placement: reachable on the day it actually departs,
    // not only as a projection on some later day.
    expect(departureRecords.segments.map((s) => s.id)).toContain(segmentRow.id)

    const arrivalRecords = await fetchDayRecords(testDb, {
      tourId: fixture.tourId,
      tourDateId: fixture.tourDateId,
      date: '2026-06-14',
      timezone: TZ,
    })
    // The tail of the same overnight journey, drawn read-only on the day it
    // lands (REE-124), not as the whole journey's only appearance.
    expect(arrivalRecords.continuedFromPrev.segments.map((s) => s.id)).toContain(segmentRow.id)
    expect(arrivalRecords.segments.map((s) => s.id)).not.toContain(segmentRow.id)
  })
})
