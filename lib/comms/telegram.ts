// Send via the Telegram Bot API. Simpler than WhatsApp: no template system, no
// 24-hour-window distinction, no positional-variable substitution. Plain text
// only, no parse_mode: MarkdownV2 requires escaping characters ('.', '-', '!',
// '(', ')' among others) that appear throughout the reused slash-command and
// day-block renderers, so sending unescaped would fail with "can't parse
// entities." Never call these synchronously from a webhook handler. Always
// call from a Trigger.dev job after the idempotency check, same rule as
// lib/comms/whatsapp.ts. Throws if Telegram rejects the call so job-level
// retry handles it.

export type TelegramButton = {
  text: string
  callback_data: string
}

export type SendTelegramMessageParams = {
  chatId: number
  text: string
  // One button per row: Telegram has no WhatsApp-style 3-button cap.
  buttons?: TelegramButton[]
}

export type SendTelegramDocumentParams = {
  chatId: number
  // Telegram accepts an HTTP URL directly; no need to download and re-upload.
  documentUrl: string
  caption?: string
}

export type SendTelegramResult = {
  messageId: number
}

export async function sendTelegramMessage(
  params: SendTelegramMessageParams
): Promise<SendTelegramResult> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    text: params.text,
  }

  if (params.buttons && params.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: params.buttons.map((b) => [{ text: b.text, callback_data: b.callback_data }]),
    }
  }

  const result = (await callTelegramApi('sendMessage', body)) as { message_id: number }
  return { messageId: result.message_id }
}

export async function sendTelegramDocument(
  params: SendTelegramDocumentParams
): Promise<SendTelegramResult> {
  const body: Record<string, unknown> = {
    chat_id: params.chatId,
    document: params.documentUrl,
  }

  if (params.caption) {
    body.caption = params.caption
  }

  const result = (await callTelegramApi('sendDocument', body)) as { message_id: number }
  return { messageId: result.message_id }
}

// Dismisses the loading spinner Telegram shows on a tapped inline-keyboard
// button. Required after every callback_query or the button spins forever on
// the crew member's device; Telegram does not infer completion from the bot's
// next message. The query expires 10 seconds after the tap, so call this
// before any slow work (Claude calls, DB writes), not after.
export async function answerTelegramCallbackQuery(callbackQueryId: string): Promise<void> {
  await callTelegramApi('answerCallbackQuery', { callback_query_id: callbackQueryId })
}

async function callTelegramApi(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('Telegram bot token not configured')
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as { ok: boolean; result?: unknown; description?: string }

  if (!res.ok || !json.ok) {
    throw new Error(`Telegram API error (${method}): ${json.description ?? res.statusText}`)
  }

  return json.result
}
