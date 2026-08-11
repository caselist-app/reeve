import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Only the adapter is stubbed. Everything below it is real: the claim, the
// dedup index and the release are notification_log rows in real Postgres, which
// is the whole reason this claim IS testable where the Redis-based inbound
// claims are not (the mocked Redis stores nothing, so a claim there never
// actually blocks a second call). Stubbing the Supabase client would delete the
// only thing worth asserting.
vi.mock('@/lib/comms/notify/adapters/telegram', () => ({
  sendTelegramRendered: vi.fn(),
}))

import { sendTelegramRendered } from '@/lib/comms/notify/adapters/telegram'
import { notifyAccount } from '@/lib/comms/notify/account'

const mockSend = vi.mocked(sendTelegramRendered)

const ACCOUNT_CHAT_ID = 987654321

describe('notifyAccount claims, sends and releases against notification_log', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()

    // The account holder's own Telegram, set by the /start link in production.
    // Without it notifyAccount has no channel and never claims anything.
    const { error } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: ACCOUNT_CHAT_ID })
      .eq('id', fixture.userId)
    if (error) throw new Error(`seed: could not set account telegram_chat_id: ${error.message}`)

    mockSend.mockReset()
    mockSend.mockResolvedValue({ providerMessageId: 'tg-msg-1' })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('a first send inserts a claim with account_id set and person_id null', async () => {
    const result = await notifyAccount({
      tourId: fixture.tourId,
      accountId: fixture.userId,
      type: 'test_account_message',
      dedupDimension: 'first',
      rendered: { body: 'Reeve here.' },
    })

    expect(result.outcome).toBe('sent')
    expect(mockSend).toHaveBeenCalledWith(ACCOUNT_CHAT_ID, { body: 'Reeve here.' })

    const { data: rows, error } = await testDb
      .from('notification_log')
      .select('account_id, person_id, channel, status, provider_message_id')
      .eq('tour_id', fixture.tourId)
      .eq('notification_type', 'test_account_message')
      .eq('dedup_dimension', 'first')
    if (error) throw new Error(`could not read notification_log: ${error.message}`)

    expect(rows).toHaveLength(1)
    const row = rows![0]
    expect(row.account_id).toBe(fixture.userId)
    expect(row.person_id).toBeNull()
    expect(row.channel).toBe('telegram')
    expect(row.status).toBe('sent')
    expect(row.provider_message_id).toBe('tg-msg-1')
  })

  it('a second send with the same dedup dimension is skipped as already sent', async () => {
    const first = await notifyAccount({
      tourId: fixture.tourId,
      accountId: fixture.userId,
      type: 'test_account_message',
      dedupDimension: 'same',
      rendered: { body: 'Reeve here.' },
    })
    expect(first.outcome).toBe('sent')

    const second = await notifyAccount({
      tourId: fixture.tourId,
      accountId: fixture.userId,
      type: 'test_account_message',
      dedupDimension: 'same',
      rendered: { body: 'Reeve here, again.' },
    })

    expect(second.outcome).toBe('skipped_already_sent')
    // The adapter fired once, not twice: the dedup index is the guard, so the
    // second send never reaches Telegram.
    expect(mockSend).toHaveBeenCalledTimes(1)

    const { count } = await testDb
      .from('notification_log')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', fixture.tourId)
      .eq('notification_type', 'test_account_message')
      .eq('dedup_dimension', 'same')
    expect(count).toBe(1)
  })

  it('when the send throws, the claim row is gone', async () => {
    // This is the assertion the whole claim-send-release pattern exists for.
    // Remove the delete in notifyAccount's catch branch and this fails: the
    // claim survives, and a retry then hits the dedup guard and is silently
    // skipped, so a failed send masquerades as a successful one forever.
    mockSend.mockRejectedValueOnce(new Error('telegram is down'))

    const result = await notifyAccount({
      tourId: fixture.tourId,
      accountId: fixture.userId,
      type: 'test_account_message',
      dedupDimension: 'thrown',
      rendered: { body: 'Reeve here.' },
    })

    expect(result.outcome).toBe('failed')

    const { data: rows, error } = await testDb
      .from('notification_log')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('notification_type', 'test_account_message')
      .eq('dedup_dimension', 'thrown')
    if (error) throw new Error(`could not read notification_log: ${error.message}`)

    expect(rows).toHaveLength(0)
  })
})
