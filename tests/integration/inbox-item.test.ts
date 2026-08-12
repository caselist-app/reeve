import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { fetchInboxItem } from '@/lib/inbox/item'
import { approveGuestEntry } from '@/lib/actions/guest-list'

// REE-152. fetchInboxItem is the single-item read behind the Inbox item
// detail route: one attention_items row, scoped to the account, plus a
// kind-specific subject.
//
// Red first, on the dangling pointer: the first version of this suite deleted
// the guest_list_entries row and asserted fetchInboxItem still resolved,
// which caught a fetchGuestRequestSubject written with `.single()` instead of
// `.maybeSingle()`: `.single()` on zero rows is a PostgREST error, which
// fetchInboxItem was, at that point, folding into its top-level `error`
// rather than telling apart from a genuinely broken read. That is the
// distinction the second test below pins.

async function insertGuestRequest(
  fixture: Fixture,
  overrides: { entryOverrides?: Record<string, unknown>; showId?: string } = {},
) {
  const { data: entry, error: entryError } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: fixture.tourId,
      show_id: overrides.showId ?? fixture.showId,
      first_name: 'Sam',
      last_name: 'Reed',
      email: 'sam.reed@example.test',
      num_tickets: 2,
      pass_type: 'ticket',
      request_channel: 'app',
      requested_by_person_id: fixture.personId,
      status: 'requested',
      ...overrides.entryOverrides,
    })
    .select('id')
    .single()
  if (entryError || !entry) throw new Error(`fixture: could not create guest entry: ${entryError?.message}`)

  const { data: item, error: itemError } = await testDb
    .from('attention_items')
    .insert({
      tour_id: fixture.tourId,
      kind: 'guest_request',
      title: 'Guest request: Sam Reed for Test Venue',
      related_table: 'guest_list_entries',
      related_id: entry.id,
    })
    .select('id')
    .single()
  if (itemError || !item) throw new Error(`fixture: could not create attention item: ${itemError?.message}`)

  return { entryId: entry.id, itemId: item.id }
}

describe('fetchInboxItem', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('on a guest_request returns the entry, the show and the requester in one read', async () => {
    const { itemId } = await insertGuestRequest(fixture)

    const { item, subject, danglingPointer, error } = await fetchInboxItem(testDb, fixture.userId, itemId)

    expect(error).toBeNull()
    expect(danglingPointer).toBe(false)
    expect(item).not.toBeNull()
    expect(item!.kind).toBe('guest_request')
    expect(item!.tour_id).toBe(fixture.tourId)

    expect(subject).not.toBeNull()
    // The entry.
    expect(subject!.firstName).toBe('Sam')
    expect(subject!.lastName).toBe('Reed')
    expect(subject!.numTickets).toBe(2)
    // The show.
    expect(subject!.showId).toBe(fixture.showId)
    expect(subject!.venueName).toBe('Test Venue')
    // The requester.
    expect(subject!.requesterName).toBe('Test Crew')
  })

  it('an item whose related_id points at a deleted entry returns the item with a null subject rather than throwing', async () => {
    const { entryId, itemId } = await insertGuestRequest(fixture)

    const { error: deleteError } = await testDb.from('guest_list_entries').delete().eq('id', entryId)
    expect(deleteError).toBeNull()

    const { item, subject, danglingPointer, error } = await fetchInboxItem(testDb, fixture.userId, itemId)

    expect(error).toBeNull()
    expect(item).not.toBeNull()
    expect(subject).toBeNull()
    expect(danglingPointer).toBe(true)
  })

  it('returns null for an item id that does not exist, with no error', async () => {
    const { item, subject, danglingPointer, error } = await fetchInboxItem(
      testDb,
      fixture.userId,
      '00000000-0000-0000-0000-000000000000',
    )

    expect(error).toBeNull()
    expect(item).toBeNull()
    expect(subject).toBeNull()
    expect(danglingPointer).toBe(false)
  })
})

describe('approveGuestEntry through the Inbox', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('leaves the entry approved and the item resolved, in that order', async () => {
    const { entryId, itemId } = await insertGuestRequest(fixture)

    const outcome = await approveGuestEntry(fixture.tourId, entryId)
    expect(outcome.error).toBeNull()

    const { data: entry } = await testDb
      .from('guest_list_entries')
      .select('status')
      .eq('id', entryId)
      .single()
    expect(entry?.status).toBe('approved')

    const { data: item } = await testDb
      .from('attention_items')
      .select('resolved_at')
      .eq('id', itemId)
      .single()
    expect(item?.resolved_at).not.toBeNull()
  })
})
