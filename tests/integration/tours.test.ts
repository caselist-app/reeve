import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateTourAction } from '@/lib/actions/tours'

// REE-266. parseTourSettingsFormData used to read every optional field as
// `formData.get(x) || undefined`, so a blank submission collapsed to "field
// never sent", which updateTourAction's `.update(parsed.data)` then silently
// skipped instead of clearing. Red first: revert parseTourSettingsFormData to
// that form and the final assertion below fails, because territory is still
// 'UK' after the clearing save.
function settingsForm(overrides: Record<string, string> = {}) {
  const fd = new FormData()
  fd.set('name', overrides.name ?? 'Test Tour')
  fd.set('start_date', overrides.start_date ?? '')
  fd.set('end_date', overrides.end_date ?? '')
  fd.set('territory', overrides.territory ?? '')
  fd.set('base_currency', overrides.base_currency ?? 'GBP')
  fd.set('timezone', overrides.timezone ?? '')
  fd.set('inbound_qa_enabled', overrides.inbound_qa_enabled ?? 'false')
  fd.set('morning_message_enabled', overrides.morning_message_enabled ?? 'false')
  return fd
}

describe('updateTourAction clears an optional field back to blank', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    const { error } = await testDb
      .from('tours')
      .update({ territory: 'UK' })
      .eq('id', fixture.tourId)
    expect(error).toBeNull()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('nulls territory when the settings form submits it blank', async () => {
    const result = await updateTourAction(fixture.tourId, settingsForm({ territory: '' }))
    expect(result.error).toBeNull()

    const { data, error } = await testDb
      .from('tours')
      .select('territory')
      .eq('id', fixture.tourId)
      .single()

    expect(error).toBeNull()
    expect(data?.territory).toBeNull()
  })

  it('leaves territory alone when the save carries a value', async () => {
    const result = await updateTourAction(fixture.tourId, settingsForm({ territory: 'EU' }))
    expect(result.error).toBeNull()

    const { data, error } = await testDb
      .from('tours')
      .select('territory')
      .eq('id', fixture.tourId)
      .single()

    expect(error).toBeNull()
    expect(data?.territory).toBe('EU')
  })
})
