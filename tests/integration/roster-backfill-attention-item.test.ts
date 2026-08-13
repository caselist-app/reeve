import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { addPerson } from '@/lib/actions/people'
import { applyRosterBackfill } from '@/lib/actions/roster-backfill'
import type { z } from 'zod'
import type { personSchema } from '@/lib/validators/person'

// Brief 35, step 5 (REE-171). On person create, after the save commits, Reeve
// detects every upcoming whole-party or by-type transport_segment/hotel_stay
// the new person is missing from and batches it into one attention_items row
// (kind roster_backfill), never one per item. Applying writes the missing
// transport_assignment/room_assignment rows, then resolves the row, and only
// once those writes have actually landed (rule 3 of brief 53).

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

function futureInstant(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function pastInstant(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const NEW_CREW_MEMBER: z.infer<typeof personSchema> = {
  person_type: 'crew',
  name: 'Sam Reed',
  role: null,
  contact_email: null,
  contact_phone: null,
  operational_channel: null,
  email_enabled: false,
  whatsapp_number: null,
  sms_number: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  dietary: null,
  allergies: null,
  home_city: null,
  passport_first_names: null,
  passport_surname: null,
  passport_number: null,
  passport_expiry: null,
  passport_country: null,
  date_of_birth: null,
  tshirt_size: null,
  notes: null,
}

async function attentionForPerson(tourId: string, personId: string) {
  const { data } = await testDb
    .from('attention_items')
    .select('*')
    .eq('tour_id', tourId)
    .eq('related_table', 'people')
    .eq('related_id', personId)
  return data ?? []
}

async function seedTransportSegment(
  tourId: string,
  opts: { createdAs: string; departAt: string | null }
) {
  const { data, error } = await testDb
    .from('transport_segments')
    .insert({ tour_id: tourId, mode: 'flight', depart_at: opts.departAt, created_as: opts.createdAs })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed transport_segment: ${error?.message}`)
  return data.id
}

async function seedHotelStay(tourId: string, opts: { createdAs: string; checkOutDate: string | null }) {
  const { data, error } = await testDb
    .from('hotel_stays')
    .insert({
      tour_id: tourId,
      name: 'Test Hotel',
      check_in_date: futureDate(1),
      check_out_date: opts.checkOutDate,
      created_as: opts.createdAs,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed hotel_stay: ${error?.message}`)
  return data.id
}

describe('roster-change detection as an Inbox item', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: futureDate(3) })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('creates exactly one attention item for 3 qualifying upcoming items, never one per item', async () => {
    // Qualifies: whole_party and crew (the new person's own type), upcoming.
    await seedTransportSegment(fixture.tourId, { createdAs: 'whole_party', departAt: futureInstant(2) })
    await seedTransportSegment(fixture.tourId, { createdAs: 'crew', departAt: futureInstant(4) })
    await seedHotelStay(fixture.tourId, { createdAs: 'whole_party', checkOutDate: futureDate(5) })

    // Does not qualify: named preset, wrong person_type, and in the past.
    await seedTransportSegment(fixture.tourId, { createdAs: 'named', departAt: futureInstant(2) })
    await seedTransportSegment(fixture.tourId, { createdAs: 'artist', departAt: futureInstant(2) })
    await seedTransportSegment(fixture.tourId, { createdAs: 'whole_party', departAt: pastInstant(2) })

    const result = await addPerson(fixture.tourId, NEW_CREW_MEMBER)
    expect(result.error).toBeNull()
    expect(result.personId).toBeTruthy()

    const items = await attentionForPerson(fixture.tourId, result.personId!)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('roster_backfill')
    expect(items[0].related_table).toBe('people')
    expect(items[0].related_id).toBe(result.personId)
    expect(items[0].resolved_at).toBeNull()
    expect(items[0].title).toContain('3 upcoming items')
  })

  it('creates no attention item when nothing qualifies', async () => {
    await seedTransportSegment(fixture.tourId, { createdAs: 'named', departAt: futureInstant(2) })
    await seedTransportSegment(fixture.tourId, { createdAs: 'whole_party', departAt: pastInstant(2) })
    await seedTransportSegment(fixture.tourId, { createdAs: 'artist', departAt: futureInstant(2) })

    const result = await addPerson(fixture.tourId, NEW_CREW_MEMBER)
    expect(result.error).toBeNull()

    const items = await attentionForPerson(fixture.tourId, result.personId!)
    expect(items).toHaveLength(0)
  })

  it('a named-preset segment is never included even when otherwise qualifying', async () => {
    await seedTransportSegment(fixture.tourId, { createdAs: 'whole_party', departAt: futureInstant(2) })
    // Same tour, same upcoming window, same mode: the only difference is
    // created_as, so this isolates the named exclusion from every other filter.
    await seedTransportSegment(fixture.tourId, { createdAs: 'named', departAt: futureInstant(2) })

    const result = await addPerson(fixture.tourId, NEW_CREW_MEMBER)
    expect(result.error).toBeNull()

    const items = await attentionForPerson(fixture.tourId, result.personId!)
    expect(items).toHaveLength(1)
    expect(items[0].title).toContain('1 upcoming item,')
  })

  it('applying the backfill writes every missing row before resolving the item', async () => {
    const segmentId = await seedTransportSegment(fixture.tourId, {
      createdAs: 'whole_party',
      departAt: futureInstant(2),
    })
    const hotelId = await seedHotelStay(fixture.tourId, { createdAs: 'crew', checkOutDate: futureDate(5) })

    const result = await addPerson(fixture.tourId, NEW_CREW_MEMBER)
    expect(result.error).toBeNull()
    const personId = result.personId!

    const items = await attentionForPerson(fixture.tourId, personId)
    expect(items).toHaveLength(1)
    expect(items[0].resolved_at).toBeNull()

    const applied = await applyRosterBackfill(personId)
    expect(applied.error).toBeNull()

    const { data: transportRows } = await testDb
      .from('transport_assignments')
      .select('*')
      .eq('segment_id', segmentId)
      .eq('person_id', personId)
    expect(transportRows).toHaveLength(1)

    const { data: roomRows } = await testDb
      .from('room_assignments')
      .select('*')
      .eq('hotel_stay_id', hotelId)
      .eq('person_id', personId)
    expect(roomRows).toHaveLength(1)
    expect(roomRows![0].room_tier).toBe('crew')

    // Resolved only after both writes landed, never before.
    const afterApply = await attentionForPerson(fixture.tourId, personId)
    expect(afterApply).toHaveLength(1)
    expect(afterApply[0].resolved_at).not.toBeNull()
  })

  it('a failed write leaves the item unresolved', async () => {
    const segmentId = await seedTransportSegment(fixture.tourId, {
      createdAs: 'whole_party',
      departAt: futureInstant(2),
    })

    const result = await addPerson(fixture.tourId, NEW_CREW_MEMBER)
    expect(result.error).toBeNull()
    const personId = result.personId!

    const items = await attentionForPerson(fixture.tourId, personId)
    expect(items).toHaveLength(1)

    // Simulates a TM manually attaching this person to the segment (via the
    // party picker) in the gap between the Inbox row being written and
    // applied. applyRosterBackfill still sees the segment as a candidate (it
    // does not re-check assignments, see lib/party/roster-backfill.ts), so its
    // insert collides with transport_assignments' own unique(segment_id,
    // person_id) constraint: a real Postgres failure, not a mock.
    const { error: preExisting } = await testDb
      .from('transport_assignments')
      .insert({ tour_id: fixture.tourId, segment_id: segmentId, person_id: personId })
    expect(preExisting).toBeNull()

    const applied = await applyRosterBackfill(personId)
    expect(applied.error).not.toBeNull()

    const afterFailedApply = await attentionForPerson(fixture.tourId, personId)
    expect(afterFailedApply).toHaveLength(1)
    expect(afterFailedApply[0].resolved_at).toBeNull()

    // The conflicting insert was rejected outright: still exactly one row, not two.
    const { data: transportRows } = await testDb
      .from('transport_assignments')
      .select('*')
      .eq('segment_id', segmentId)
      .eq('person_id', personId)
    expect(transportRows).toHaveLength(1)
  })
})
