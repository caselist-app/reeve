import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { confirmExtraction } from '@/lib/actions/extractions'
import type { ExtractionProposal } from '@/lib/ai/extract'

// REE-154: confirmExtraction narrows proposed_rows server-side to the indices
// the TM kept. Red first, per the ticket: call this with keep entirely
// ignored (all rows written) and the discarded flight and the hotel both
// appear. This file asserts the fix, not that starting point.

const PROPOSAL: ExtractionProposal = {
  shows: [],
  transport_segments: [
    {
      mode: 'flight',
      origin: 'LAX',
      destination: 'JFK',
      depart_at: '2026-09-01T14:00:00Z',
      arrive_at: '2026-09-01T22:00:00Z',
      carrier_operator: 'Delta',
      vehicle_or_flight_no: 'DL100',
      booking_reference: null,
    },
    {
      mode: 'flight',
      origin: 'JFK',
      destination: 'LHR',
      depart_at: '2026-09-05T20:00:00Z',
      arrive_at: '2026-09-06T08:00:00Z',
      carrier_operator: 'Delta',
      vehicle_or_flight_no: 'DL200',
      booking_reference: null,
    },
  ],
  hotel_stays: [
    {
      name: 'Ace Hotel',
      city: 'New York',
      address: null,
      check_in_date: '2026-09-01',
      check_out_date: '2026-09-05',
      check_in_time: null,
      check_out_time: null,
      confirmation_number: null,
    },
  ],
}

async function seedForwardedEmail(tourId: string) {
  const { data, error } = await testDb
    .from('forwarded_emails')
    .insert({
      tour_id: tourId,
      subject: 'Flight and hotel confirmations',
      extraction_status: 'extracted',
      proposed_rows: PROPOSAL,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed forwarded_emails: ${error?.message}`)
  return data.id
}

describe('confirmExtraction narrows to the kept rows', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('keeping one of two flights writes exactly one transport_segments row and zero hotel_stays', async () => {
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)

    const result = await confirmExtraction(forwardedEmailId, {
      shows: [],
      transport_segments: [0],
      hotel_stays: [],
    })
    expect(result.error).toBeNull()

    const { data: segments } = await testDb
      .from('transport_segments')
      .select('*')
      .eq('tour_id', fixture.tourId)
    expect(segments).toHaveLength(1)
    expect(segments?.[0].vehicle_or_flight_no).toBe('DL100')

    const { data: hotels } = await testDb
      .from('hotel_stays')
      .select('*')
      .eq('tour_id', fixture.tourId)
    expect(hotels).toHaveLength(0)

    const { data: forwarded } = await testDb
      .from('forwarded_emails')
      .select('extraction_status')
      .eq('id', forwardedEmailId)
      .single()
    expect(forwarded?.extraction_status).toBe('confirmed')
  })

  it('rejects a kept index outside the proposed rows and writes nothing', async () => {
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)

    const result = await confirmExtraction(forwardedEmailId, {
      shows: [],
      transport_segments: [5],
      hotel_stays: [],
    })
    expect(result.error).not.toBeNull()

    const { data: segments } = await testDb
      .from('transport_segments')
      .select('*')
      .eq('tour_id', fixture.tourId)
    expect(segments).toHaveLength(0)
  })
})
