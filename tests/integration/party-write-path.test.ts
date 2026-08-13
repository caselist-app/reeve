import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createTransportSegment } from '@/lib/actions/transport'
import { createHotelStay } from '@/lib/actions/hotels'
import { confirmExtraction } from '@/lib/actions/extractions'
import type { ExtractionProposal } from '@/lib/ai/extract'

// REE-169: the picker materialises explicit assignment rows on save, across
// every producer of a segment or stay. These are the write-path assertions
// the brief names directly: a people list writes exactly that many
// assignment rows tied to the new record, no list writes zero and never
// blocks the save, and created_as stores whichever preset produced the list.

async function insertPerson(accountId: string, tourId: string, name: string, personType = 'crew') {
  const { data: contact, error: contactError } = await testDb
    .from('contacts')
    .insert({ account_id: accountId, name })
    .select('id')
    .single()
  if (contactError || !contact) throw new Error(`could not create contact: ${contactError?.message}`)

  const { data: person, error: personError } = await testDb
    .from('people')
    .insert({ tour_id: tourId, contact_id: contact.id, person_type: personType })
    .select('id')
    .single()
  if (personError || !person) throw new Error(`could not create person: ${personError?.message}`)

  return person.id as string
}

describe('party write path', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  describe('createTransportSegment', () => {
    it('given a people list of 3 writes exactly 3 transport_assignment rows tied to the new segment', async () => {
      const personA = await insertPerson(fixture.userId, fixture.tourId, 'Alex Roadie', 'artist')
      const personB = await insertPerson(fixture.userId, fixture.tourId, 'Sam Driver', 'crew')
      const personC = await insertPerson(fixture.userId, fixture.tourId, 'Jo Manager', 'management')

      const result = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        people: [personA, personB, personC],
        created_as: 'named',
      })

      expect(result.error).toBeNull()
      expect(result.segmentId).toBeTruthy()

      const { data: assignments } = await testDb
        .from('transport_assignments')
        .select('person_id')
        .eq('segment_id', result.segmentId!)

      expect(assignments).toHaveLength(3)
      expect(assignments?.map((a) => a.person_id).sort()).toEqual([personA, personB, personC].sort())

      const { data: segment } = await testDb
        .from('transport_segments')
        .select('created_as')
        .eq('id', result.segmentId!)
        .single()
      expect(segment?.created_as).toBe('named')
    })

    it('given no people list writes zero transport_assignment rows and still saves', async () => {
      const result = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
      })

      expect(result.error).toBeNull()
      expect(result.segmentId).toBeTruthy()

      const { data: assignments } = await testDb
        .from('transport_assignments')
        .select('person_id')
        .eq('segment_id', result.segmentId!)
      expect(assignments).toHaveLength(0)

      const { data: segment } = await testDb
        .from('transport_segments')
        .select('created_as')
        .eq('id', result.segmentId!)
        .single()
      // No created_as passed: the column's own default applies, not a value
      // this action invented.
      expect(segment?.created_as).toBe('whole_party')
    })

    it('stores whichever preset created_as was passed', async () => {
      const result = await createTransportSegment(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        mode: 'ground',
        people: [fixture.personId],
        created_as: 'crew',
      })

      expect(result.error).toBeNull()
      const { data: segment } = await testDb
        .from('transport_segments')
        .select('created_as')
        .eq('id', result.segmentId!)
        .single()
      expect(segment?.created_as).toBe('crew')
    })

    it('rejects a person id that is not on this tour and writes nothing', async () => {
      const other = await createFixture()
      try {
        const outsiderId = other.personId

        const result = await createTransportSegment(fixture.tourId, {
          tour_date_id: fixture.tourDateId,
          mode: 'ground',
          people: [outsiderId],
        })

        expect(result.error).not.toBeNull()

        const { data: segments } = await testDb
          .from('transport_segments')
          .select('id')
          .eq('tour_id', fixture.tourId)
        expect(segments).toHaveLength(0)
      } finally {
        await destroyFixture(other)
      }
    })
  })

  describe('createHotelStay', () => {
    it('given a people list of 3 writes exactly 3 room_assignment rows tied to the new stay', async () => {
      const personA = await insertPerson(fixture.userId, fixture.tourId, 'Alex Roadie', 'artist')
      const personB = await insertPerson(fixture.userId, fixture.tourId, 'Sam Driver', 'crew')
      const personC = await insertPerson(fixture.userId, fixture.tourId, 'Jo Manager', 'management')

      const result = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Test Hotel',
        check_in_date: fixture.date,
        people: [personA, personB, personC],
        created_as: 'named',
      })

      expect(result.error).toBeNull()
      expect(result.stayId).toBeTruthy()

      const { data: assignments } = await testDb
        .from('room_assignments')
        .select('person_id, room_tier')
        .eq('hotel_stay_id', result.stayId!)

      expect(assignments).toHaveLength(3)
      expect(assignments?.map((a) => a.person_id).sort()).toEqual([personA, personB, personC].sort())
      // person_type-derived tier: artist stays artist, crew and management both
      // fold into crew (the check constraint has no third value).
      const tierByPerson = new Map(assignments?.map((a) => [a.person_id, a.room_tier]))
      expect(tierByPerson.get(personA)).toBe('artist')
      expect(tierByPerson.get(personB)).toBe('crew')
      expect(tierByPerson.get(personC)).toBe('crew')

      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('created_as')
        .eq('id', result.stayId!)
        .single()
      expect(stay?.created_as).toBe('named')
    })

    it('given no people list writes zero room_assignment rows and still saves', async () => {
      const result = await createHotelStay(fixture.tourId, {
        tour_date_id: fixture.tourDateId,
        name: 'Test Hotel',
        check_in_date: fixture.date,
      })

      expect(result.error).toBeNull()
      expect(result.stayId).toBeTruthy()

      const { data: assignments } = await testDb
        .from('room_assignments')
        .select('person_id')
        .eq('hotel_stay_id', result.stayId!)
      expect(assignments).toHaveLength(0)

      const { data: stay } = await testDb
        .from('hotel_stays')
        .select('created_as')
        .eq('id', result.stayId!)
        .single()
      expect(stay?.created_as).toBe('whole_party')
    })
  })

  describe('confirmExtraction', () => {
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
      hotel_stays: [],
    }

    async function seedForwardedEmail(tourId: string) {
      const { data, error } = await testDb
        .from('forwarded_emails')
        .insert({
          tour_id: tourId,
          subject: 'Flight confirmations',
          extraction_status: 'extracted',
          proposed_rows: PROPOSAL,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`could not seed forwarded_emails: ${error?.message}`)
      return data.id as string
    }

    it('given a people list for one proposed segment writes the matching rows for that segment', async () => {
      const personA = await insertPerson(fixture.userId, fixture.tourId, 'Alex Roadie', 'artist')
      const personB = await insertPerson(fixture.userId, fixture.tourId, 'Sam Driver', 'crew')

      const forwardedEmailId = await seedForwardedEmail(fixture.tourId)

      // Keep both proposed segments, but attach a party to only index 0 (the
      // one the TM's picker touched). Index 1 gets no entry at all.
      const result = await confirmExtraction(
        forwardedEmailId,
        { shows: [], transport_segments: [0, 1], hotel_stays: [] },
        { transport_segments: { '0': { people: [personA, personB], created_as: 'named' } } }
      )

      expect(result.error).toBeNull()

      const { data: segments } = await testDb
        .from('transport_segments')
        .select('id, vehicle_or_flight_no, created_as')
        .eq('tour_id', fixture.tourId)
        .order('vehicle_or_flight_no')
      expect(segments).toHaveLength(2)

      const dl100 = segments!.find((s) => s.vehicle_or_flight_no === 'DL100')!
      const dl200 = segments!.find((s) => s.vehicle_or_flight_no === 'DL200')!
      expect(dl100.created_as).toBe('named')
      expect(dl200.created_as).toBe('whole_party')

      const { data: dl100Assignments } = await testDb
        .from('transport_assignments')
        .select('person_id')
        .eq('segment_id', dl100.id)
      expect(dl100Assignments?.map((a) => a.person_id).sort()).toEqual([personA, personB].sort())

      const { data: dl200Assignments } = await testDb
        .from('transport_assignments')
        .select('person_id')
        .eq('segment_id', dl200.id)
      expect(dl200Assignments).toHaveLength(0)
    })
  })
})
