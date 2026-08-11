import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem, updateDayItem } from '@/lib/actions/day-items'

// The proof that deleting the Add event form (REE-90) lost nothing.
//
// AddEventForm collected two fields the typed day form does not: `location` (a
// Google Places input) and `notes`. Both already live on day-item-panel.tsx, so
// the path is now: type a title into the day form, which commits a `kind:'other'`
// row through createDayItem, then add the location and notes one click later
// through updateDayItem. This walks exactly that path and asserts the second
// write lands both columns without disturbing the title the first write set.
//
// It is the partial-write shape from partial-writes.test.ts pointed at the fields
// the deleted form owned: an update that mentions location and notes and no title
// must leave the title alone. If definedOnly() were dropped from updateDayItem,
// the absent title would map to null and the item would lose its name, which is
// the exact silent data loss the form deletion must not reintroduce.

describe('typed custom item keeps the location and notes the event form used to collect', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('adds a location and notes to a titled custom item without touching the title', async () => {
    // Step one, the day form's Enter path: a custom item with a title and no
    // location, the shape a TM gets by typing a name into the one-door input.
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      kind: 'other',
      title: 'After show',
      start_clock: '23:00',
    })
    expect(created.error).toBeNull()
    if (!created.itemId) throw new Error('createDayItem did not return an item id')

    // It landed with no location and no notes, so the update below is the only
    // thing that can put them there.
    const seeded = await testDb
      .from('day_items')
      .select('title, location, notes')
      .eq('id', created.itemId)
      .single()
    expect(seeded.data?.title).toBe('After show')
    expect(seeded.data?.location).toBeNull()
    expect(seeded.data?.notes).toBeNull()

    // Step two, the panel: the two fields the event form used to own, and no
    // title. This is the payload day-item-panel.tsx posts when a TM fills in the
    // location and notes on an item that already exists.
    const updated = await updateDayItem(created.itemId, {
      location: 'Green room',
      notes: 'Guest list at the door.',
    })
    expect(updated.error).toBeNull()

    const after = await testDb
      .from('day_items')
      .select('title, location, notes')
      .eq('id', created.itemId)
      .single()

    // Both columns hold what the update wrote.
    expect(after.data?.location).toBe('Green room')
    expect(after.data?.notes).toBe('Guest list at the door.')
    // And the title the create set is untouched. Undefined in the payload means
    // the panel never sent it, so definedOnly() omits it: the row keeps its name
    // rather than nulling it. This is the assertion that fails if that guard goes.
    expect(after.data?.title).toBe('After show')
  })
})
