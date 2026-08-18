import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'
import { redis } from '@/lib/redis'
import { enqueueWithClaim } from '@/lib/comms/inbound-claim'
import { sendTelegramMessage, answerTelegramCallbackQuery } from '@/lib/comms/telegram'
import { parseGuestCallback } from '@/lib/comms/guest-callback'
import { decideGuestEntry, type GuestDecision, type DecideOutcome } from '@/lib/guest-list/decide'

const LINK_EXPIRED_MESSAGE = 'This link has expired, ask your tour manager to send a new one.'

const STOP_NOT_CONNECTED_MESSAGE = "You're not connected to Reeve, so there's nothing to disconnect."

const STOP_CONFIRM_MESSAGE =
  "Disconnect your Telegram from Reeve?\n\nYou'll stop getting schedule updates here. Ask your tour manager for a new link to reconnect."

// POST: inbound messages and button taps from Telegram users.
// Rule: verify secret token, dedupe, resolve identity (or handle /start
// linking), enqueue, return 200. Nothing else happens in this handler.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // REE-273 temporary: confirming whether Telegram delivers a message_reaction
  // update at all before any Telegram-specific reaction code is written.
  // Removed before this step's commit, win or lose.
  console.log('REE-273 raw telegram update:', rawBody)

  // Telegram has no HMAC-over-body scheme like Meta's x-hub-signature-256.
  // setWebhook is called once with a secret_token, echoed back on every
  // request as this header. Fail closed if the secret is unset, same rule as
  // the WhatsApp handler.
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 401 })
  }
  const receivedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  const receivedBuf = Buffer.from(receivedSecret, 'utf8')
  const expectedBuf = Buffer.from(webhookSecret, 'utf8')
  if (receivedBuf.length !== expectedBuf.length || !timingSafeEqual(receivedBuf, expectedBuf)) {
    return NextResponse.json({ error: 'Invalid secret token' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const update = payload as Record<string, unknown>

  // update_id is monotonically increasing per bot, never reused: the direct
  // equivalent of wamid. It is deduped at enqueue time, below, through the same
  // claim-send-release helper the WhatsApp route uses.
  const updateId = update.update_id as number | undefined

  const admin = createAdminClient()

  // Normalise message and callback_query (inline-keyboard tap) into the same
  // { chatId, body } shape the router expects. A callback_query has no
  // message.text; callback_data stands in for typed text, mirroring how the
  // WhatsApp handler treats an interactive.button_reply.title tap as
  // equivalent to typed text.
  let chatId: number | undefined
  let body: string | undefined
  let fromUsername: string | null = null

  const callbackQuery = update.callback_query as Record<string, unknown> | undefined
  const message = update.message as Record<string, unknown> | undefined

  if (callbackQuery) {
    const cqMessage = callbackQuery.message as Record<string, unknown> | undefined
    const chat = cqMessage?.chat as Record<string, unknown> | undefined
    chatId = chat?.id as number | undefined
    body = callbackQuery.data as string | undefined

    // Dismiss the loading spinner immediately. The query expires 10 seconds
    // after the tap, well before the DB round trips below would complete, and
    // Telegram does not infer completion from the bot's next message.
    const callbackQueryId = callbackQuery.id as string | undefined
    if (callbackQueryId) {
      try {
        await answerTelegramCallbackQuery(callbackQueryId)
      } catch {
        // Non-fatal: worst case the spinner times out on its own.
      }
    }
  } else if (message) {
    const chat = message.chat as Record<string, unknown> | undefined
    chatId = chat?.id as number | undefined
    body = message.text as string | undefined
    const from = message.from as Record<string, unknown> | undefined
    fromUsername = (from?.username as string | undefined) ?? null
  }

  if (!chatId || !body) {
    return NextResponse.json({ status: 'ok' })
  }

  // /start <token> interception. A brand-new Telegram user has no linked
  // contact yet, so this has to be handled before identity resolution runs,
  // not after.
  if (body.startsWith('/start')) {
    await handleLinking(admin, chatId, body.slice('/start'.length).trim(), fromUsername)
    return NextResponse.json({ status: 'ok' })
  }

  // Guest-list Approve/Decline, tapped by the account holder from the message
  // REE-134 sends them. The TM's own chat id lives on accounts.telegram_chat_id
  // (REE-132), not on a crew contact, so this is resolved account-first, before
  // the crew contact resolution below: brief 30's decision that an admin update
  // must never fall through crew logic. Only a gl: payload takes this path, so a
  // TM's ordinary typed message still routes as normal. The spinner was already
  // dismissed above, so the DB work here happens after the tap is acknowledged.
  if (body.startsWith('gl:')) {
    await handleGuestCallback(admin, chatId, body)
    return NextResponse.json({ status: 'ok' })
  }

  // /stop interception, crew-only (brief 63). Resolved by contacts.telegram_chat_id
  // alone, never accounts: /stop needs no (tour_id, person_id) pair, so it is
  // handled here rather than added to lib/comms/router.ts's SLASH_COMMANDS, which
  // is hard-scoped to one. Same "handled and returned before the webhook's
  // existing body-extraction and enqueue logic runs" precedent as /start and
  // gl: above. No database write happens in this step: it only sends the
  // confirm/cancel prompt (or the "not connected" reply), never disconnects.
  if (isStopCommand(body)) {
    await handleStopCommand(admin, chatId)
    return NextResponse.json({ status: 'ok' })
  }

  // Map the chat id to a person across the TM's active tours. Same join shape
  // and STATUS_ORDER tie-break as app/api/whatsapp/inbound/route.ts, column
  // swapped: a contact can be crew on more than one tour at once.
  const { data: people } = await admin
    .from('people')
    .select('id, tour_id, tours!inner(id, status, created_at), contacts!inner(telegram_chat_id)')
    .eq('contacts.telegram_chat_id', chatId)

  if (!people || people.length === 0) {
    return NextResponse.json({ status: 'ok' }) // Unknown chat id.
  }

  const STATUS_ORDER: Record<string, number> = {
    active: 0,
    planning: 1,
    completed: 2,
    archived: 3,
  }

  const sorted = [...people].sort((a, b) => {
    const ta = a.tours as { status: string; created_at: string } | null
    const tb = b.tours as { status: string; created_at: string } | null
    const sa = STATUS_ORDER[ta?.status ?? 'archived'] ?? 3
    const sb = STATUS_ORDER[tb?.status ?? 'archived'] ?? 3
    if (sa !== sb) return sa - sb
    return new Date(tb?.created_at ?? 0).getTime() - new Date(ta?.created_at ?? 0).getTime()
  })

  const person = sorted[0]
  if (!person) return NextResponse.json({ status: 'ok' }) // Should not happen given length check above.

  // Claim the update id, enqueue the router job, release the claim if the
  // enqueue throws. Without the release, a transient Trigger.dev outage would
  // strand the claim: Telegram's retry of the same update would hit the dedup
  // guard, get a 200, and the crew member's message would be lost for the full
  // 24 hour TTL. Same helper and rule the WhatsApp route uses.
  const CLAIM_TTL_SECONDS = 60 * 60 * 24
  try {
    await enqueueWithClaim({
      claimKey: updateId != null ? `tg_update:${updateId}` : null,
      claim: (key) => redis.set(key, '1', { nx: true, ex: CLAIM_TTL_SECONDS }),
      release: (key) => redis.del(key),
      enqueue: () =>
        tasks.trigger('telegram-router', {
          tour_id: person.tour_id,
          person_id: person.id,
          chat_id: chatId,
          body,
          update_id: updateId ?? null,
        }),
    })
  } catch (err) {
    // Deliberate non-200: Telegram retries, and the claim is now free for the
    // retry to get through, so a transient Trigger.dev outage recovers by
    // itself. Dropping an inbound crew message is worse than a retry.
    console.error('telegram inbound: enqueue failed', err)
    return NextResponse.json({ error: 'Enqueue failed' }, { status: 500 })
  }

  // Always return 200 fast. Telegram retries on anything else.
  return NextResponse.json({ status: 'ok' })
}

// Same trim-and-lowercase tolerance parseSlashCommand gives every other
// command in lib/comms/router.ts: "/stop" or "/stop " followed by anything.
function isStopCommand(text: string): boolean {
  const trimmed = text.trim().toLowerCase()
  return trimmed === '/stop' || trimmed.startsWith('/stop ')
}

// Resolves a /stop by contacts.telegram_chat_id only, nothing else. /stop is
// crew-only, so a TM's own chat linked via accounts.telegram_chat_id gets the
// same "not connected" reply here unless that chat is also separately linked
// as a crew contact. Sends the confirm/cancel prompt, carrying the contact id
// on the confirm button (dc:y:<contactId>) so a later stale tap can be told
// apart from a fresh one; writes nothing.
async function handleStopCommand(
  admin: ReturnType<typeof createAdminClient>,
  chatId: number
): Promise<void> {
  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle()

  if (!contact) {
    await sendTelegramMessage({ chatId, text: STOP_NOT_CONNECTED_MESSAGE })
    return
  }

  await sendTelegramMessage({
    chatId,
    text: STOP_CONFIRM_MESSAGE,
    buttons: [
      { text: 'Yes, disconnect', callback_data: `dc:y:${contact.id}` },
      { text: 'Cancel', callback_data: 'dc:n' },
    ],
  })
}

// Resolves a /start <token> deep link: looks up the token, checks it is not
// expired or already used, links the contact, marks the token used, and
// replies with a plain confirmation. Runs entirely on the admin client: a
// valid, unexpired, unused token is the authorization here, there is no
// signed-in user in this request.
async function handleLinking(
  admin: ReturnType<typeof createAdminClient>,
  chatId: number,
  token: string,
  username: string | null
): Promise<void> {
  if (!token) {
    await sendTelegramMessage({ chatId, text: LINK_EXPIRED_MESSAGE })
    return
  }

  const { data: linkToken } = await admin
    .from('telegram_link_tokens')
    .select('contact_id, account_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  const isExpired =
    !linkToken || linkToken.used_at !== null || new Date(linkToken.expires_at).getTime() < Date.now()

  if (isExpired || !linkToken) {
    await sendTelegramMessage({ chatId, text: LINK_EXPIRED_MESSAGE })
    return
  }

  // A token with no contact links the account holder to their own chat, rather
  // than a crew member's. Generated from account settings (REE-132), it writes
  // accounts.telegram_chat_id so Reeve can message the TM directly. No per-tour
  // uniqueness trigger applies: this is the account's own Telegram, not a crew
  // identity shared across a tour's roster.
  if (linkToken.contact_id === null) {
    const { error: accountError } = await admin
      .from('accounts')
      .update({ telegram_chat_id: chatId })
      .eq('id', linkToken.account_id)

    if (accountError) {
      await sendTelegramMessage({ chatId, text: LINK_EXPIRED_MESSAGE })
      return
    }

    await admin
      .from('telegram_link_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('token', token)

    await sendTelegramMessage({ chatId, text: "You're connected. Reeve will message you here." })
    return
  }

  const { error } = await admin
    .from('contacts')
    .update({
      telegram_chat_id: chatId,
      ...(username ? { telegram_username: username } : {}),
    })
    .eq('id', linkToken.contact_id)

  if (error) {
    // enforce_contact_telegram_unique raises 23505 if this chat id already
    // links to a different contact sharing a tour with this one.
    const message =
      error.code === '23505'
        ? 'This Telegram account is already connected to someone else on a shared tour. Ask your tour manager for help.'
        : LINK_EXPIRED_MESSAGE
    await sendTelegramMessage({ chatId, text: message })
    return
  }

  // Linking a Telegram chat is only half the model: a contact with no
  // operational_channel gets no operational messages at all, so a fresh link
  // that left the channel unset would connect the chat and then send nothing to
  // it. Default the operational channel to Telegram, but only when the TM has
  // not already chosen one: an explicit WhatsApp choice is not overwritten by a
  // later Telegram link. The `.is('operational_channel', null)` guard makes this
  // an atomic set-if-unset rather than a read-then-write race.
  await admin
    .from('contacts')
    .update({ operational_channel: 'telegram' })
    .eq('id', linkToken.contact_id)
    .is('operational_channel', null)

  await admin
    .from('telegram_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token', token)

  await sendTelegramMessage({ chatId, text: "You're connected. You'll get schedule updates here." })
}

// Handles a tapped Approve or Decline on a guest request. Runs on the admin
// client with no signed-in user, the runBroadcast split (brief 30): the panel's
// actions supply requireUser(), this supplies the account resolution, and both
// then hand decideGuestEntry the (entryId, tourId) it scopes its read by.
//
// The parser rejects an unknown or malformed payload, the account gate rejects a
// tap from anyone but the TM, and the account-owns-tour check is the ownership
// gate the admin client cannot get from RLS. decideGuestEntry re-reads the entry
// and no-ops unless it is still 'requested', so a TM who already approved in the
// panel and then taps Approve on their phone does not send the guest a second
// email: they are told it was already handled instead.
async function handleGuestCallback(
  admin: ReturnType<typeof createAdminClient>,
  chatId: number,
  data: string
): Promise<void> {
  const parsed = parseGuestCallback(data)
  if (!parsed) return // Not a guest callback, or a malformed one: nothing to do.

  // The presser must be the account holder. accounts is the only place the TM's
  // own chat id is stored; a crew contact has no authority to approve. No match
  // means the tap did not come from a TM, so it is a silent no-op.
  const { data: account } = await admin
    .from('accounts')
    .select('id')
    .eq('telegram_chat_id', chatId)
    .maybeSingle()
  if (!account) return

  const { data: entry } = await admin
    .from('guest_list_entries')
    .select('id, tour_id, first_name, last_name')
    .eq('id', parsed.entryId)
    .maybeSingle()
  if (!entry) {
    await sendTelegramMessage({ chatId, text: 'That guest request is no longer on the list.' })
    return
  }

  // The admin client bypasses RLS, so the entry above is readable regardless of
  // owner. This is the ownership gate: the tour it is on must belong to the
  // account that tapped. Without it, one TM could action another's entry.
  const { data: tour } = await admin
    .from('tours')
    .select('id')
    .eq('id', entry.tour_id)
    .eq('account_id', account.id)
    .maybeSingle()
  if (!tour) return // Not this TM's entry.

  const outcome = await decideGuestEntry(admin, {
    entryId: entry.id,
    tourId: entry.tour_id,
    decision: parsed.decision,
  })

  const guestName = [entry.first_name, entry.last_name].filter(Boolean).join(' ') || 'the guest'

  if (outcome.error) {
    await sendTelegramMessage({ chatId, text: `Could not update ${guestName}. Try the panel.` })
    return
  }

  await sendTelegramMessage({
    chatId,
    text: guestDecisionConfirmation(parsed.decision, guestName, outcome),
  })
}

// The line the TM gets back after a tap. When the entry was already decided,
// report the real current status rather than the decision just attempted, so a
// TM who approved on their laptop and then tapped Approve on their phone is not
// told it just happened.
function guestDecisionConfirmation(
  decision: GuestDecision,
  guestName: string,
  outcome: DecideOutcome
): string {
  if (outcome.alreadyDecided) {
    return `${guestName} is already ${outcome.status}.`
  }
  return decision === 'approve' ? `Approved ${guestName}.` : `Declined ${guestName}.`
}
