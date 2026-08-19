import { describe, it, expect, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// REE-315. The design (Brief 64, "one chat, two rosters") is one TM, one
// Telegram identity, globally: no two accounts should ever be able to link the
// same chat id. 20260811223110 added accounts.telegram_chat_id with a plain
// partial index, which indexes lookups but enforces nothing. This asserts the
// database itself refuses a second account claiming a chat id another account
// already holds, on the Postgres error code rather than merely "an error
// happened": 23505 is unique_violation, and a typo in a column name also
// errors, so a test that accepts any error passes for the wrong reason.

const UNIQUE_VIOLATION = '23505'

describe('accounts.telegram_chat_id is globally unique', () => {
  let first: Fixture
  let second: Fixture

  afterEach(async () => {
    if (first) await destroyFixture(first)
    if (second) await destroyFixture(second)
  })

  it('rejects a second account claiming a chat id already linked to another account', async () => {
    first = await createFixture()
    second = await createFixture()

    const chatId = 123456789

    const { error: firstError } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: chatId })
      .eq('id', first.userId)
    expect(firstError).toBeNull()

    const { error: secondError } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: chatId })
      .eq('id', second.userId)

    expect(secondError?.code).toBe(UNIQUE_VIOLATION)
  })

  it('still allows two accounts with no chat id linked', async () => {
    // The near-miss row: a partial unique index that rejected null would break
    // every account that has never linked Telegram, which is most of them.
    first = await createFixture()
    second = await createFixture()

    const { data: accounts, error } = await testDb
      .from('accounts')
      .select('telegram_chat_id')
      .in('id', [first.userId, second.userId])

    expect(error).toBeNull()
    expect(accounts?.every((a) => a.telegram_chat_id === null)).toBe(true)
  })
})
