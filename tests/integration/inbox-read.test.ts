import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { markAttentionItemRead } from '@/lib/actions/inbox'
import { fetchInbox } from '@/lib/inbox/query'

// REE-150. markAttentionItemRead is the Inbox's read action: it sets read_at
// once and never touches resolved_at. fetchInbox (REE-149) deliberately keeps
// a read item in the queue until it is resolved elsewhere (REE-148), so the
// assertion that matters here is not just that read_at moves, but that the
// item is still in the queue afterwards.
//
// Red first: this suite was first written with markAttentionItemRead setting
// resolved_at instead of read_at. The first two assertions passed regardless
// of which column moved; the third caught it, because a resolved item drops
// out of fetchInbox and a read one does not. That is the read-versus-resolved
// distinction a TM would notice: reading an item should never make it look
// dealt with.

describe('markAttentionItemRead', () => {
  let fixture: Fixture
  let itemId: string

  beforeEach(async () => {
    fixture = await createFixture()

    const { data, error } = await testDb
      .from('attention_items')
      .insert({
        tour_id: fixture.tourId,
        kind: 'email_extraction',
        title: 'Forwarded email',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not seed an attention item: ${error?.message}`)
    itemId = data.id
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readItem() {
    const { data } = await testDb
      .from('attention_items')
      .select('read_at, resolved_at')
      .eq('id', itemId)
      .single()
    return data
  }

  it('sets read_at', async () => {
    const before = await readItem()
    expect(before?.read_at).toBeNull()

    const result = await markAttentionItemRead(itemId)

    expect(result.error).toBeNull()
    const after = await readItem()
    expect(after?.read_at).not.toBeNull()
  })

  it('does not move read_at on a second call', async () => {
    const first = await markAttentionItemRead(itemId)
    expect(first.error).toBeNull()
    const afterFirst = await readItem()

    await new Promise((resolve) => setTimeout(resolve, 10))

    const second = await markAttentionItemRead(itemId)
    expect(second.error).toBeNull()
    const afterSecond = await readItem()

    expect(afterSecond?.read_at).toBe(afterFirst?.read_at)
  })

  it('leaves the item in the queue: read, not resolved', async () => {
    const result = await markAttentionItemRead(itemId)
    expect(result.error).toBeNull()

    const after = await readItem()
    expect(after?.resolved_at).toBeNull()

    const { items, error } = await fetchInbox(testDb, fixture.userId)

    expect(error).toBeNull()
    expect(items.map((i) => i.id)).toContain(itemId)
  })
})
