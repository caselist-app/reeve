import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveParty } from '@/lib/party/resolve'

// Brief 35 step 1. lib/party/ is the one place that answers "who is attached
// to this transport_segment or hotel_stay", replacing the six hand-rolled
// versions of the same query. These four cases are the contract every reader
// depends on: a real manifest resolves, an empty one is not an error, hotels
// behave the same as transport, and a tour boundary is never crossed.

async function insertPerson(accountId: string, tourId: string, name: string) {
  const { data: contact, error: contactError } = await testDb
    .from('contacts')
    .insert({ account_id: accountId, name })
    .select('id')
    .single()
  if (contactError || !contact) throw new Error(`could not create contact: ${contactError?.message}`)

  const { data: person, error: personError } = await testDb
    .from('people')
    .insert({ tour_id: tourId, contact_id: contact.id, person_type: 'crew' })
    .select('id')
    .single()
  if (personError || !person) throw new Error(`could not create person: ${personError?.message}`)

  return person.id
}

async function insertSegment(tourId: string) {
  const { data: segment, error } = await testDb
    .from('transport_segments')
    .insert({ tour_id: tourId, mode: 'bus' })
    .select('id')
    .single()
  if (error || !segment) throw new Error(`could not create segment: ${error?.message}`)
  return segment.id
}

async function insertHotelStay(tourId: string) {
  const { data: stay, error } = await testDb
    .from('hotel_stays')
    .insert({ tour_id: tourId, name: 'Test Hotel' })
    .select('id')
    .single()
  if (error || !stay) throw new Error(`could not create hotel stay: ${error?.message}`)
  return stay.id
}

async function assignToSegment(tourId: string, segmentId: string, personId: string) {
  const { error } = await testDb
    .from('transport_assignments')
    .insert({ tour_id: tourId, segment_id: segmentId, person_id: personId })
  if (error) throw new Error(`could not create transport_assignment: ${error.message}`)
}

async function assignToRoom(tourId: string, hotelStayId: string, personId: string) {
  const { error } = await testDb
    .from('room_assignments')
    .insert({ tour_id: tourId, hotel_stay_id: hotelStayId, person_id: personId, room_tier: 'crew' })
  if (error) throw new Error(`could not create room_assignment: ${error.message}`)
}

describe('resolveParty', () => {
  let fixture: Fixture
  let otherFixture: Fixture | undefined

  afterEach(async () => {
    await destroyFixture(fixture)
    if (otherFixture) await destroyFixture(otherFixture)
    otherFixture = undefined
  })

  it('resolves a segment with two transport_assignment rows to exactly those two people', async () => {
    fixture = await createFixture()
    const segmentId = await insertSegment(fixture.tourId)
    const personA = await insertPerson(fixture.userId, fixture.tourId, 'Alex Roadie')
    const personB = await insertPerson(fixture.userId, fixture.tourId, 'Sam Driver')
    await assignToSegment(fixture.tourId, segmentId, personA)
    await assignToSegment(fixture.tourId, segmentId, personB)

    const result = await resolveParty(testDb, fixture.tourId, {
      kind: 'transport_segment',
      ids: [segmentId],
    })

    expect(result.error).toBeNull()
    expect(result.people.map((p) => p.id).sort()).toEqual([personA, personB].sort())
  })

  it('resolves a segment with zero assignment rows to an empty list, not an error', async () => {
    fixture = await createFixture()
    const segmentId = await insertSegment(fixture.tourId)

    const result = await resolveParty(testDb, fixture.tourId, {
      kind: 'transport_segment',
      ids: [segmentId],
    })

    expect(result.error).toBeNull()
    expect(result.people).toEqual([])
  })

  it('resolves a hotel stay the same way, through room_assignment rows', async () => {
    fixture = await createFixture()
    const stayId = await insertHotelStay(fixture.tourId)
    const personA = await insertPerson(fixture.userId, fixture.tourId, 'Jo Crew')
    await assignToRoom(fixture.tourId, stayId, personA)

    const result = await resolveParty(testDb, fixture.tourId, {
      kind: 'hotel_stay',
      ids: [stayId],
    })

    expect(result.error).toBeNull()
    expect(result.people.map((p) => p.id)).toEqual([personA])
  })

  it('never returns a person assigned on a different tour\'s segment', async () => {
    fixture = await createFixture()
    otherFixture = await createFixture()

    const otherSegmentId = await insertSegment(otherFixture.tourId)
    const otherPersonId = await insertPerson(otherFixture.userId, otherFixture.tourId, 'Other Tour Roadie')
    await assignToSegment(otherFixture.tourId, otherSegmentId, otherPersonId)

    // Querying with fixture's own tourId but the other tour's segment id: the
    // assignment's own tour_id never matches fixture.tourId, so it must never
    // surface, even though the segment id is a real row.
    const result = await resolveParty(testDb, fixture.tourId, {
      kind: 'transport_segment',
      ids: [otherSegmentId],
    })

    expect(result.error).toBeNull()
    expect(result.people).toEqual([])
  })
})
