import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, createSecondTour, type Fixture } from './fixture'
import { fetchInbox, fetchResolvedInbox } from '@/lib/inbox/query'

// REE-149. fetchInbox is the account-wide open-items read behind the Inbox
// (brief 53): every attention_items row across every tour the account owns,
// unresolved, newest first.
//
// Red first, on the ordering: this suite was first written with fetchInbox
// ordering by `tours!inner(name)`. PostgREST cannot order the parent by an
// embedded column, so the `.order` silently did nothing and the last test
// below passed anyway, because the fallback order happened to already be
// created-at. Reordering the inserts (the second tour's item first, the first
// tour's item second, with tour names that sort the opposite way) made it
// fail, which is what moved the `.order` onto attention_items.created_at, the
// top-level column, where it actually filters. CLAUDE.md's rule ("A filter on
// an embedded table needs !inner, or it does not filter anything") is the
// general form of the bug this test pins.

describe('fetchInbox', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  function item(overrides: Record<string, unknown> = {}) {
    return {
      tour_id: fixture.tourId,
      kind: 'email_extraction',
      title: 'Forwarded email',
      ...overrides,
    }
  }

  it('excludes a resolved item', async () => {
    const { error: insertError } = await testDb
      .from('attention_items')
      .insert(item({ resolved_at: new Date().toISOString() }))
    expect(insertError).toBeNull()

    const { items, error } = await fetchInbox(testDb, fixture.userId)

    expect(error).toBeNull()
    expect(items).toHaveLength(0)
  })

  // The assertion the whole brief rests on: REE-148 gave attention_items a
  // read_at that the badge count deliberately ignores, and the Inbox has to
  // ignore it the same way. A queue that dropped an item the moment someone
  // opened it would empty itself under the TM's finger.
  it('includes a read but unresolved item', async () => {
    const { error: insertError } = await testDb
      .from('attention_items')
      .insert(item({ read_at: new Date().toISOString() }))
    expect(insertError).toBeNull()

    const { items, error } = await fetchInbox(testDb, fixture.userId)

    expect(error).toBeNull()
    expect(items).toHaveLength(1)
    expect(items[0].read_at).not.toBeNull()
  })

  it('reads across every tour on the account with no tour filter', async () => {
    const second = await createSecondTour(fixture)

    const { error: firstError } = await testDb.from('attention_items').insert(item())
    expect(firstError).toBeNull()
    const { error: secondError } = await testDb
      .from('attention_items')
      .insert(item({ tour_id: second.tourId, title: 'Second tour item' }))
    expect(secondError).toBeNull()

    const { items, error } = await fetchInbox(testDb, fixture.userId)

    expect(error).toBeNull()
    expect(items.map((i) => i.tour_id).sort()).toEqual([fixture.tourId, second.tourId].sort())
  })

  it('orders by created_at, not by an embedded column', async () => {
    // createSecondTour names its tour 'Other Tour'; the fixture's is 'Test
    // Tour'. 'Other Tour' sorts before 'Test Tour', so inserting the second
    // tour's item first (older) and the fixture's second (newer) sets up a
    // case where ordering by created_at and ordering by tour name disagree:
    // an `.order` that silently fell back to tour name would put the older,
    // 'Other Tour' item first, but the correct read puts the newer item first.
    const second = await createSecondTour(fixture)

    const { data: olderItem, error: olderError } = await testDb
      .from('attention_items')
      .insert(item({ tour_id: second.tourId, title: 'Older, other tour' }))
      .select('id')
      .single()
    expect(olderError).toBeNull()
    if (!olderItem) throw new Error('insert did not return a row')

    // now() has enough resolution to differ between two statements a network
    // round trip apart, but sleep past a millisecond anyway rather than rely
    // on it.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const { data: newerItem, error: newerError } = await testDb
      .from('attention_items')
      .insert(item({ title: 'Newer, test tour' }))
      .select('id')
      .single()
    expect(newerError).toBeNull()
    if (!newerItem) throw new Error('insert did not return a row')

    const { items, error } = await fetchInbox(testDb, fixture.userId)

    expect(error).toBeNull()
    expect(items.map((i) => i.id)).toEqual([newerItem.id, olderItem.id])
  })
})

// REE-231. fetchResolvedInbox is the archive read: the same account-wide,
// !inner-scoped shape as fetchInbox, but resolved rows instead of open ones.
// Seeding one of each in the same test is the regression guard the issue
// asks for: fetchInbox's existing exclusion of resolved rows has to keep
// holding now that a resolved row exists to exclude.
describe('fetchResolvedInbox', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  function item(overrides: Record<string, unknown> = {}) {
    return {
      tour_id: fixture.tourId,
      kind: 'email_extraction',
      title: 'Forwarded email',
      ...overrides,
    }
  }

  it('returns exactly the resolved item, and fetchInbox still excludes it', async () => {
    const { error: resolvedError } = await testDb
      .from('attention_items')
      .insert(item({ resolved_at: new Date().toISOString(), title: 'Resolved item' }))
    expect(resolvedError).toBeNull()

    const { error: openError } = await testDb.from('attention_items').insert(item({ title: 'Open item' }))
    expect(openError).toBeNull()

    const { items: resolvedItems, error: resolvedFetchError } = await fetchResolvedInbox(testDb, fixture.userId)
    expect(resolvedFetchError).toBeNull()
    expect(resolvedItems).toHaveLength(1)
    expect(resolvedItems[0].title).toBe('Resolved item')
    expect(resolvedItems[0].resolved_at).not.toBeNull()

    const { items: openItems, error: openFetchError } = await fetchInbox(testDb, fixture.userId)
    expect(openFetchError).toBeNull()
    expect(openItems).toHaveLength(1)
    expect(openItems[0].title).toBe('Open item')
    expect(openItems[0].resolved_at).toBeNull()
  })
})
