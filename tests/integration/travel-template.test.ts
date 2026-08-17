import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { renderTravel } from '@/lib/comms/templates/travel'

// REE-238. /travel already answered with the booked time; this adds the live
// AirLabs status (Brief 31) so a crew member checking a flight sees the same
// disruption the TM would get through flight-status-check.ts, without having
// to ask.

function departingSoon(): string {
  return new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
}

async function assignSegment(tourId: string, segmentId: string, personId: string) {
  const { error } = await testDb
    .from('transport_assignments')
    .insert({ tour_id: tourId, segment_id: segmentId, person_id: personId })
  if (error) throw new Error(`seed: could not create transport_assignment: ${error.message}`)
}

describe('/travel surfaces live flight status', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('renders Status, Gate and Terminal for a flight with a known status', async () => {
    const { data: segment, error } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'flight',
        vehicle_or_flight_no: 'TA123',
        origin: 'LHR',
        destination: 'JFK',
        depart_at: departingSoon(),
        flight_status: 'cancelled',
        gate: '12',
        terminal: '2',
      })
      .select('id')
      .single()
    if (error || !segment) throw new Error(`seed: could not create transport_segment: ${error?.message}`)

    await assignSegment(fixture.tourId, segment.id, fixture.personId)

    const result = await renderTravel(fixture.personId, fixture.tourId)

    expect(result).toContain('Status: Cancelled')
    expect(result).toContain('Gate: 12')
    expect(result).toContain('Terminal: 2')
  })

  it('omits the Status line for ground travel and for a flight with no status yet', async () => {
    const { data: segment, error } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'ground',
        origin: 'Hotel',
        destination: 'Venue',
        depart_at: departingSoon(),
        flight_status: null,
      })
      .select('id')
      .single()
    if (error || !segment) throw new Error(`seed: could not create transport_segment: ${error?.message}`)

    await assignSegment(fixture.tourId, segment.id, fixture.personId)

    const result = await renderTravel(fixture.personId, fixture.tourId)

    expect(result).not.toContain('Status:')
  })
})
