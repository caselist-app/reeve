import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 53's read state migration (REE-148). The updated_at trigger only
// exists in a real Postgres, so this writes directly through testDb rather
// than through an action. Red first: run before the migration lands, and
// watch the second case fail because nothing moves updated_at yet.

describe('attention_items read state', () => {
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

  it('inserts with read_at null and updated_at set', async () => {
    const { data, error } = await testDb
      .from('attention_items')
      .insert(item())
      .select('read_at, updated_at')
      .single()
    expect(error).toBeNull()
    expect(data?.read_at).toBeNull()
    expect(data?.updated_at).not.toBeNull()
  })

  it('moves updated_at on update', async () => {
    const { data: inserted, error: insertError } = await testDb
      .from('attention_items')
      .insert(item())
      .select('id, updated_at')
      .single()
    expect(insertError).toBeNull()
    if (!inserted) throw new Error('insert did not return a row')

    // now() has enough resolution to differ between two statements a network
    // round trip apart, but sleep past a millisecond anyway rather than rely
    // on it.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const { data: updated, error: updateError } = await testDb
      .from('attention_items')
      .update({ title: 'Updated title' })
      .eq('id', inserted.id)
      .select('updated_at')
      .single()
    expect(updateError).toBeNull()
    expect(updated?.updated_at).not.toBe(inserted.updated_at)
  })

  it('setting read_at leaves resolved_at null', async () => {
    const { data: inserted, error: insertError } = await testDb
      .from('attention_items')
      .insert(item())
      .select('id')
      .single()
    expect(insertError).toBeNull()
    if (!inserted) throw new Error('insert did not return a row')

    const { data: updated, error: updateError } = await testDb
      .from('attention_items')
      .update({ read_at: new Date().toISOString() })
      .eq('id', inserted.id)
      .select('read_at, resolved_at')
      .single()
    expect(updateError).toBeNull()
    expect(updated?.read_at).not.toBeNull()
    expect(updated?.resolved_at).toBeNull()
  })
})
