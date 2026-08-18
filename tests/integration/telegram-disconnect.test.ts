import { NextRequest } from 'next/server'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 63, steps 2 and 3 (REE-307, REE-308). Exercises app/api/telegram/inbound/route.ts's
// POST handler directly, the same way tests/integration/guest-request-flow.test.ts
// exercises its own flow against a real Postgres: only the Telegram send and
// the Trigger.dev dispatcher are stubbed, everything else (the secret-token
// check, the contact lookup, the response shape) is the real route.
//
// Step 2 (/stop) only sends the confirm/cancel prompt, or the "not connected"
// reply, and writes nothing. Step 3 (handleDisconnectCallback, below) is the
// dc: confirm/cancel write itself.

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
const DISCONNECT_CANCELLED_TEXT = "Okay, you're still connected."
const DISCONNECT_DONE_TEXT =
  "You're disconnected. Ask your tour manager for a new link if you want to reconnect."
const DISCONNECT_ALREADY_TEXT = "You're already disconnected."

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

describe('telegram dc: confirm/cancel (REE-308)', () => {
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

  it('confirming disconnects a contact whose operational_channel is telegram', async () => {
    await testDb
      .from('contacts')
      .update({
        telegram_chat_id: 777,
        telegram_username: 'crewmember',
        operational_channel: 'telegram',
      })
      .eq('id', fixture.contactId)

    const res = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 777, text: DISCONNECT_DONE_TEXT })

    const after = await contactRow(fixture.contactId)
    expect(after).toEqual({
      telegram_chat_id: null,
      telegram_username: null,
      operational_channel: null,
    })
  })

  it('confirming a contact whose operational_channel is whatsapp leaves it unchanged', async () => {
    const { data: contact } = await testDb
      .from('contacts')
      .insert({ account_id: fixture.userId, name: 'Second Crew' })
      .select('id')
      .single()
    if (!contact) throw new Error('could not create second contact')

    await testDb
      .from('contacts')
      .update({
        telegram_chat_id: 888,
        telegram_username: 'secondcrew',
        operational_channel: 'whatsapp',
      })
      .eq('id', contact.id)

    const res = await postUpdate(callbackUpdate(888, `dc:y:${contact.id}`))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 888, text: DISCONNECT_DONE_TEXT })

    const after = await contactRow(contact.id)
    expect(after).toEqual({
      telegram_chat_id: null,
      telegram_username: null,
      operational_channel: 'whatsapp',
    })
  })

  it('cancelling leaves the contact unchanged', async () => {
    await testDb
      .from('contacts')
      .update({
        telegram_chat_id: 777,
        telegram_username: 'crewmember',
        operational_channel: 'telegram',
      })
      .eq('id', fixture.contactId)

    const before = await contactRow(fixture.contactId)

    const res = await postUpdate(callbackUpdate(777, 'dc:n'))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 777, text: DISCONNECT_CANCELLED_TEXT })

    const after = await contactRow(fixture.contactId)
    expect(after).toEqual(before)
  })

  it('a stale tap (already-disconnected contact) replies "already disconnected" and writes nothing', async () => {
    await testDb
      .from('contacts')
      .update({
        telegram_chat_id: 777,
        telegram_username: 'crewmember',
        operational_channel: 'telegram',
      })
      .eq('id', fixture.contactId)

    const firstRes = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(firstRes.status).toBe(200)
    expect(mockSend).toHaveBeenCalledWith({ chatId: 777, text: DISCONNECT_DONE_TEXT })

    mockSend.mockClear()

    const secondRes = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(secondRes.status).toBe(200)
    expect(mockSend).toHaveBeenCalledWith({ chatId: 777, text: DISCONNECT_ALREADY_TEXT })

    const after = await contactRow(fixture.contactId)
    expect(after).toEqual({
      telegram_chat_id: null,
      telegram_username: null,
      operational_channel: null,
    })
  })
})

describe('telegram disconnect Inbox alert and TM notification (REE-309)', () => {
  let fixture: Fixture
  const originalSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  const TM_CHAT_ID = 424242424

  beforeEach(async () => {
    fixture = await createFixture()
    process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET
    mockTrigger.mockClear()
    mockSend.mockClear()
    // notifyAccount's send path (sendTelegramRendered) destructures messageId
    // off this mock's return value. The dc: tests above never read the return
    // value of sendTelegramMessage, so it was never given one; this describe
    // block's confirm branch does go through notifyAccount, and an unresolved
    // mock (undefined) throws on that destructure, which notifyAccount's own
    // try/catch swallows as a send failure, silently releasing the claim it
    // had just inserted.
    mockSend.mockResolvedValue({ messageId: 1 })

    await testDb
      .from('contacts')
      .update({
        telegram_chat_id: 777,
        telegram_username: 'crewmember',
        operational_channel: 'telegram',
      })
      .eq('id', fixture.contactId)

    // The TM's own Telegram, without which notifyAccount has no channel and
    // never claims a notification_log row.
    await testDb.from('accounts').update({ telegram_chat_id: TM_CHAT_ID }).eq('id', fixture.userId)
  })

  afterEach(async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = originalSecret
    await destroyFixture(fixture)
  })

  async function openDisconnectAlert(contactId: string) {
    const { data } = await testDb
      .from('attention_items')
      .select('id, tour_id, kind, related_table, related_id, resolved_at')
      .eq('kind', 'telegram_disconnect')
      .eq('related_table', 'contacts')
      .eq('related_id', contactId)
      .is('resolved_at', null)
      .maybeSingle()
    return data
  }

  it('files an Inbox alert and DMs the TM on a confirmed disconnect', async () => {
    const res = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(res.status).toBe(200)

    const alert = await openDisconnectAlert(fixture.contactId)
    expect(alert).toMatchObject({
      tour_id: fixture.tourId,
      kind: 'telegram_disconnect',
      related_table: 'contacts',
      related_id: fixture.contactId,
      resolved_at: null,
    })

    const { data: logRows } = await testDb
      .from('notification_log')
      .select('notification_type, channel, account_id')
      .eq('tour_id', fixture.tourId)
      .eq('notification_type', 'telegram_disconnect')
    expect(logRows).toHaveLength(1)
    expect(logRows![0]).toMatchObject({
      notification_type: 'telegram_disconnect',
      channel: 'telegram',
      account_id: fixture.userId,
    })

    expect(mockSend).toHaveBeenCalledWith({
      chatId: TM_CHAT_ID,
      text: expect.stringContaining('Test Crew'),
    })
  })

  it('multi-tour tie-break: files the alert against the planning tour, not the completed one', async () => {
    const { data: artist } = await testDb
      .from('artists')
      .insert({ account_id: fixture.userId, name: 'Second Artist' })
      .select('id')
      .single()
    if (!artist) throw new Error('could not create second artist')

    const { data: completedTour } = await testDb
      .from('tours')
      .insert({
        account_id: fixture.userId,
        artist_id: artist.id,
        name: 'Completed Tour',
        status: 'completed',
      })
      .select('id')
      .single()
    if (!completedTour) throw new Error('could not create second tour')

    // fixture.tourId is 'planning' by default (the schema default), so this
    // is the tie the alert has to break correctly.
    const { error: peopleError } = await testDb
      .from('people')
      .insert({ tour_id: completedTour.id, contact_id: fixture.contactId, person_type: 'crew' })
    if (peopleError) throw new Error(`could not crew the second tour: ${peopleError.message}`)

    const res = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(res.status).toBe(200)

    const alert = await openDisconnectAlert(fixture.contactId)
    expect(alert?.tour_id).toBe(fixture.tourId)
  })

  it('a contact with no roster membership on any tour: own fields still clear, nothing filed, nothing throws', async () => {
    const { data: orphanContact } = await testDb
      .from('contacts')
      .insert({
        account_id: fixture.userId,
        name: 'Orphan Crew',
        telegram_chat_id: 999,
        telegram_username: 'orphan',
        operational_channel: 'telegram',
      })
      .select('id')
      .single()
    if (!orphanContact) throw new Error('could not create orphan contact')

    const res = await postUpdate(callbackUpdate(999, `dc:y:${orphanContact.id}`))
    expect(res.status).toBe(200)

    expect(mockSend).toHaveBeenCalledWith({ chatId: 999, text: DISCONNECT_DONE_TEXT })

    const after = await contactRow(orphanContact.id)
    expect(after).toEqual({
      telegram_chat_id: null,
      telegram_username: null,
      operational_channel: null,
    })

    const alert = await openDisconnectAlert(orphanContact.id)
    expect(alert).toBeNull()

    const { data: logRows } = await testDb
      .from('notification_log')
      .select('id')
      .eq('account_id', fixture.userId)
      .eq('notification_type', 'telegram_disconnect')
    expect(logRows).toHaveLength(0)
  })

  it('reconnecting resolves the open disconnect alert', async () => {
    const disconnectRes = await postUpdate(callbackUpdate(777, `dc:y:${fixture.contactId}`))
    expect(disconnectRes.status).toBe(200)

    const openBefore = await openDisconnectAlert(fixture.contactId)
    expect(openBefore).not.toBeNull()

    mockSend.mockClear()

    const { data: token } = await testDb
      .from('telegram_link_tokens')
      .insert({ contact_id: fixture.contactId, account_id: fixture.userId })
      .select('token')
      .single()
    if (!token) throw new Error('could not create link token')

    const reconnectRes = await postUpdate(messageUpdate(777, `/start ${token.token}`))
    expect(reconnectRes.status).toBe(200)

    const { data: resolved } = await testDb
      .from('attention_items')
      .select('resolved_at')
      .eq('id', openBefore!.id)
      .single()
    expect(resolved?.resolved_at).not.toBeNull()
  })
})
