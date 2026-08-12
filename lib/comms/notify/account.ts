import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramRendered } from './adapters/telegram'
import type { RenderedTelegram } from './types'

export type NotifyAccountInput = {
  // A message to the account holder is still about a tour (a delay on their
  // Europe run, a settlement that needs their eye), so notification_log.tour_id
  // stays not null and the send is scoped to one tour.
  tourId: string
  accountId: string
  // Free-form on the account path: unlike notify(), there is no renderer
  // registry here yet. The one telegram target renders its own body, so the
  // caller hands the rendered payload in directly.
  type: string
  // What makes this send unique within its type. Combined with
  // (tour, account, type, channel) it is the durable idempotency key, keyed by
  // notification_log_account_dedup_idx.
  dedupDimension: string
  rendered: RenderedTelegram
}

export type NotifyAccountResult = {
  outcome: 'sent' | 'skipped_already_sent' | 'no_channel' | 'failed'
  providerMessageId?: string | null
  error?: string
}

// Sends one notification to the account holder over Telegram, claim-send-release
// against notification_log writing account_id (person_id null). Telegram is the
// only account channel in this slice: an account's identity is its
// telegram_chat_id, set when the TM links their own account through the /start
// deep link. If it is unset the account is unreachable, so nothing is sent.
//
// The claim is a notification_log row inserted before the send. Its unique index
// makes a double-send impossible; a failed send deletes the claim so a retry can
// try again. This is the same pattern notify() uses for crew, and it is the half
// that is genuinely testable, because the claim is a real Postgres row rather
// than a Redis key.
export async function notifyAccount(input: NotifyAccountInput): Promise<NotifyAccountResult> {
  const admin = createAdminClient()

  const { data: account } = await admin
    .from('accounts')
    .select('telegram_chat_id')
    .eq('id', input.accountId)
    .single()

  const chatId = account?.telegram_chat_id ?? null
  if (chatId === null) return { outcome: 'no_channel' }

  const logKey = {
    tour_id: input.tourId,
    account_id: input.accountId,
    notification_type: input.type,
    channel: 'telegram',
    dedup_dimension: input.dedupDimension,
  }

  // Claim the send. A unique violation (23505) means it already happened.
  const { error: claimError } = await admin
    .from('notification_log')
    .insert({ ...logKey, status: 'queued' })

  if (claimError) {
    if (claimError.code === '23505') return { outcome: 'skipped_already_sent' }
    return { outcome: 'failed', error: claimError.message }
  }

  try {
    const result = await sendTelegramRendered(chatId, input.rendered)

    await admin
      .from('notification_log')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId,
      })
      .match(logKey)

    return { outcome: 'sent', providerMessageId: result.providerMessageId }
  } catch (err) {
    // Release the claim so a retry can re-attempt. Without this delete a failed
    // send looks like a success to the next run, which is the exact bug the
    // claim-send-release pattern exists to prevent.
    await admin.from('notification_log').delete().match(logKey)
    return {
      outcome: 'failed',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
