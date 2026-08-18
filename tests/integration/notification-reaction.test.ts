import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { recordReaction } from '@/lib/comms/record-reaction'

// Real Postgres via the standard fixture, not mocked: the guard this covers
// (.is('reacted_at', null)) is a property of the write itself, and stubbing
// the Supabase client would delete the only thing worth asserting.

describe('recordReaction matches a reaction to its notification_log row, once', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function insertLogRow(providerMessageId: string, dedupDimension: string) {
    const { data, error } = await testDb
      .from('notification_log')
      .insert({
        tour_id: fixture.tourId,
        person_id: fixture.personId,
        notification_type: 'test_reaction',
        channel: 'whatsapp',
        dedup_dimension: dedupDimension,
        status: 'sent',
        provider_message_id: providerMessageId,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed: could not create notification_log row: ${error?.message}`)
    return data.id
  }

  it('a first reaction sets reacted_at and reaction_emoji and reports recorded: true', async () => {
    const providerMessageId = `wamid.${fixture.tourId}.first`
    await insertLogRow(providerMessageId, 'first')

    const result = await recordReaction(testDb, {
      providerMessageId,
      emoji: '\u{1F44D}',
      channel: 'whatsapp',
    })

    expect(result).toEqual({ recorded: true })

    const { data: row, error } = await testDb
      .from('notification_log')
      .select('reacted_at, reaction_emoji')
      .eq('provider_message_id', providerMessageId)
      .single()
    if (error || !row) throw new Error(`could not read notification_log row: ${error?.message}`)

    expect(row.reacted_at).not.toBeNull()
    expect(row.reaction_emoji).toBe('\u{1F44D}')
  })

  it('a second reaction on the same row never overwrites the first', async () => {
    const providerMessageId = `wamid.${fixture.tourId}.second`
    await insertLogRow(providerMessageId, 'second')

    const first = await recordReaction(testDb, {
      providerMessageId,
      emoji: '\u{1F44D}',
      channel: 'whatsapp',
    })
    expect(first).toEqual({ recorded: true })

    const { data: afterFirst, error: firstError } = await testDb
      .from('notification_log')
      .select('reacted_at, reaction_emoji')
      .eq('provider_message_id', providerMessageId)
      .single()
    if (firstError || !afterFirst) throw new Error(`could not read notification_log row: ${firstError?.message}`)

    const second = await recordReaction(testDb, {
      providerMessageId,
      emoji: '\u{1F525}',
      channel: 'whatsapp',
    })
    expect(second).toEqual({ recorded: false })

    const { data: afterSecond, error: secondError } = await testDb
      .from('notification_log')
      .select('reacted_at, reaction_emoji')
      .eq('provider_message_id', providerMessageId)
      .single()
    if (secondError || !afterSecond) throw new Error(`could not read notification_log row: ${secondError?.message}`)

    expect(afterSecond.reacted_at).toBe(afterFirst.reacted_at)
    expect(afterSecond.reaction_emoji).toBe('\u{1F44D}')
  })

  it('an empty-string emoji (a removal) is a no-op, leaving both fields null', async () => {
    const providerMessageId = `wamid.${fixture.tourId}.removal`
    await insertLogRow(providerMessageId, 'removal')

    const result = await recordReaction(testDb, {
      providerMessageId,
      emoji: '',
      channel: 'whatsapp',
    })

    expect(result).toEqual({ recorded: false })

    const { data: row, error } = await testDb
      .from('notification_log')
      .select('reacted_at, reaction_emoji')
      .eq('provider_message_id', providerMessageId)
      .single()
    if (error || !row) throw new Error(`could not read notification_log row: ${error?.message}`)

    expect(row.reacted_at).toBeNull()
    expect(row.reaction_emoji).toBeNull()
  })

  it('a provider_message_id matching no row returns recorded: false without throwing', async () => {
    const result = await recordReaction(testDb, {
      providerMessageId: 'wamid.does-not-exist',
      emoji: '\u{1F44D}',
      channel: 'whatsapp',
    })

    expect(result).toEqual({ recorded: false })
  })
})
