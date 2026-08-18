import { NextRequest } from 'next/server'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 63, step 2 (REE-307). Exercises app/api/telegram/inbound/route.ts's
// POST handler directly, the same way tests/integration/guest-request-flow.test.ts
// exercises its own flow against a real Postgres: only the Telegram send and
// the Trigger.dev dispatcher are stubbed, everything else (the secret-token
// check, the contact lookup, the response shape) is the real route.
//
// This step only intercepts /stop and sends the confirm/cancel prompt, or the
// "not connected" reply. No database write happens here: handleDisconnectCallback
// (the dc: confirm/cancel write) is a later step of the same brief.

vi.mock('@trigger.dev/sdk/v3', () => ({ tasks: { trigger: vi.fn() } }))
vi.mock('@/lib/comms/telegram', () => ({
  sendTelegramMessage: vi.fn(),
  answerTelegramCallbackQuery: vi.fn(),
}))

import { tasks } from '@trigger.dev/sdk/v3'
import { sendTelegramMessage } from '@/lib/comms/telegram'
import { POST } from '@/app/api/telegram/inbound/route'

const mockTrigger = vi.mocked(tasks.trigger)
const mockSend = vi.mocked(sendTelegramMessage)

const WEBHOOK_SECRET = 'test-telegram-webhook-secret'

const STOP_CONFIRM_TEXT =
  "Disconnect your Telegram from Reeve?\n\nYou'll stop getting schedule updates here. Ask your tour manager for a new link to reconnect."
const STOP_NOT_CONNECTED_TEXT = "You're not connected to Reeve, so there's nothing to disconnect."

function postUpdate(update: Record<string, unknown>) {
  const request = new NextRequest('http://localhost/api/telegram/inbound', {
    method: 'POST',
    body: JSON.stringify(update),
    headers: {
      'content-type': 'application/json',
      'x-telegram-bot-api-secret-token': WEBHOOK_SECRET,
    },
  })
  return POST(request)
}

function messageUpdate(chatId: number, text: string) {
  return { update_id: Math.floor(Math.random() * 1_000_000), message: { chat: { id: chatId }, text } }
}

function callbackUpdate(chatId: number, data: string) {
  return {
    update_id: Math.floor(Math.random() * 1_000_000),
    callback_query: { id: 'cb1', data, message: { chat: { id: chatId } } },
  }
}

async function contactRow(contactId: string) {
  const { data } = await testDb
    .from('contacts')
    .select('telegram_chat_id, telegram_username, operational_channel')
    .eq('id', contactId)
    .single()
  return data
}

describe('telegram /stop interception', () => {
  let fixture: Fixture
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET

  beforeEach(async () => {
    fixture = await createFixture()
    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET
    mockTrigger.mockClear()
    mockSend.mockClear()
  })

  afterEach(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret
    await destroyFixture(fixture)
  })

  it('sends the confirm prompt for a connected crew contact and writes nothing', async () => {
    const { error } = await testDb
      .from('contacts')
      .update({ telegram_chat_id: 777 })
      .eq('id', fixture.contactId)
    expect(error).toBeNull()

    const before = await contactRow(fixture.contactId)

    const res = await postUpdate(messageUpdate(777, '/stop'))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({
      chatId: 777,
      text: STOP_CONFIRM_TEXT,
      buttons: [
        { text: 'Yes, disconnect', callback_data: `dc:y:${fixture.contactId}` },
        { text: 'Cancel', callback_data: 'dc:n' },
      ],
    })

    const after = await contactRow(fixture.contactId)
    expect(after).toEqual(before)
    expect(mockTrigger).not.toHaveBeenCalled()
  })

  it('replies "not connected" for a chat id matching no contact, and writes nothing', async () => {
    const res = await postUpdate(messageUpdate(424242, '/stop'))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 424242, text: STOP_NOT_CONNECTED_TEXT })
    expect(mockTrigger).not.toHaveBeenCalled()
  })

  it('replies "not connected" for a chat id that only matches accounts.telegram_chat_id, never touching the account', async () => {
    const { error } = await testDb
      .from('accounts')
      .update({ telegram_chat_id: 555 })
      .eq('id', fixture.userId)
    expect(error).toBeNull()

    const res = await postUpdate(messageUpdate(555, '/stop'))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 555, text: STOP_NOT_CONNECTED_TEXT })
    expect(mockTrigger).not.toHaveBeenCalled()

    const { data: account } = await testDb
      .from('accounts')
      .select('telegram_chat_id')
      .eq('id', fixture.userId)
      .single()
    expect(account?.telegram_chat_id).toBe(555)
  })

  it('never enqueues to telegram-router for a /stop message or a dc: callback', async () => {
    await testDb.from('contacts').update({ telegram_chat_id: 777 }).eq('id', fixture.contactId)

    await postUpdate(messageUpdate(777, '/stop'))
    expect(mockTrigger).not.toHaveBeenCalled()

    // An unmatched chat tapping a dc: button: nothing to resolve it to a person,
    // so it never reaches the router enqueue either.
    await postUpdate(callbackUpdate(424242, `dc:y:${fixture.contactId}`))
    expect(mockTrigger).not.toHaveBeenCalled()
  })
})
