import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { assembleTourContext } from '@/lib/ai/context'

// REE-239. Crew Q&A and logistics synthesis both read through
// assembleTourContext, so a flight's live AirLabs tracking data (flight_status,
// gate, terminal, last_tracked_at - added Brief 31, REE-238 surfaced them on
// /travel) only reaches the model if the select and the TourContext type both
// carry them. A column added to transport_segments but not to this file's
// select string is invisible to the model even though it is right there in
// the database.
describe('assembleTourContext carries live flight tracking data', () => {
  let fixture: Fixture

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('surfaces flight_status, gate, terminal and last_tracked_at on a tracked flight segment', async () => {
    fixture = await createFixture()

    const lastTrackedAt = new Date().toISOString()
    const { data: segment, error } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'flight',
        vehicle_or_flight_no: 'TA123',
        origin: 'LHR',
        destination: 'JFK',
        flight_status: 'delayed',
        gate: '5',
        terminal: '3',
        last_tracked_at: lastTrackedAt,
      })
      .select('id')
      .single()
    if (error || !segment) throw new Error(`seed: could not create transport_segment: ${error?.message}`)

    const context = await assembleTourContext(fixture.tourId)

    const tracked = context.transport.find((t) => t.id === segment.id)
    expect(tracked).toBeDefined()
    expect(tracked?.flight_status).toBe('delayed')
    expect(tracked?.gate).toBe('5')
    expect(tracked?.terminal).toBe('3')
    expect(tracked?.last_tracked_at).toBe(lastTrackedAt)
  })

  it('leaves flight_status, gate, terminal and last_tracked_at null on an untracked segment', async () => {
    fixture = await createFixture()

    // A ground segment, and a flight that has never been polled: neither has
    // AirLabs data yet, so the model should see an honest null rather than a
    // stale or invented value.
    const { data: segment, error } = await testDb
      .from('transport_segments')
      .insert({
        tour_id: fixture.tourId,
        mode: 'ground',
        origin: 'Hotel',
        destination: 'Venue',
      })
      .select('id')
      .single()
    if (error || !segment) throw new Error(`seed: could not create transport_segment: ${error?.message}`)

    const context = await assembleTourContext(fixture.tourId)

    const untracked = context.transport.find((t) => t.id === segment.id)
    expect(untracked).toBeDefined()
    expect(untracked?.flight_status).toBeNull()
    expect(untracked?.gate).toBeNull()
    expect(untracked?.terminal).toBeNull()
    expect(untracked?.last_tracked_at).toBeNull()
  })
})
