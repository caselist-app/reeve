import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/redis'
import { telegramAiRatelimit } from '@/lib/ratelimit'
import { routeInbound } from '@/lib/comms/router'
import { sendTelegramMessage } from '@/lib/comms/telegram'
import { answerCrewQuestion } from '@/lib/ai/answer'

export type TelegramRouterPayload = {
  tour_id: string
  person_id: string
  chat_id: number
  body: string
  update_id: number | null
}

// Processes an inbound Telegram message or callback_query after the webhook
// handler has verified the secret token, mapped the chat id to a person, and
// returned 200. Mirrors trigger/jobs/whatsapp-router.ts: slash commands
// render from data with zero AI, free text goes to Claude only when the TM
// has enabled inbound_qa_enabled on this tour. routeInbound's from_number
// field is unused internally, so the chat id stands in for it unchanged.
export const telegramRouterJob = task({
  id: 'telegram-router',
  run: async (payload: TelegramRouterPayload) => {
    const result = await routeInbound({
      from_number: String(payload.chat_id),
      body: payload.body,
      tour_id: payload.tour_id,
      person_id: payload.person_id,
    })

    if (result.action === 'template') {
      // Second idempotency guard before the outbound send.
      // The webhook guard covers most retries; this covers job-level retries.
      const claimKey = payload.update_id != null ? `router:sent:tg:${payload.update_id}` : null
      if (claimKey) {
        try {
          const claimed = await redis.set(claimKey, '1', { nx: true, ex: 60 * 60 * 24 })
          if (claimed === null) return { action: 'template', sent: false, reason: 'duplicate' }
        } catch {
          // Redis unavailable: proceed rather than drop a command reply.
        }
      }

      try {
        // Attach the same command shortcuts as inline-keyboard buttons, one
        // per row (no WhatsApp-style 3-button cap). A tap arrives back as a
        // callback_query with data equal to the command, routed identically
        // to typed slash commands.
        await sendTelegramMessage({
          chatId: payload.chat_id,
          text: result.reply,
          buttons: [
            { text: '/itinerary', callback_data: '/itinerary' },
            { text: '/travel', callback_data: '/travel' },
            { text: '/hotel', callback_data: '/hotel' },
          ],
        })
      } catch (err) {
        // Release the claim so a Trigger.dev retry can attempt the send again.
        if (claimKey) {
          try {
            await redis.del(claimKey)
          } catch {
            // Redis unavailable: nothing to release.
          }
        }
        throw err
      }
      return { action: 'template', sent: true }
    }

    // Free text: check opt-in gate before calling Claude.
    // The TM must enable inbound_qa_enabled on the tour settings page.
    const admin = createAdminClient()
    const { data: tour } = await admin
      .from('tours')
      .select('inbound_qa_enabled')
      .eq('id', payload.tour_id)
      .single()

    if (!tour?.inbound_qa_enabled) {
      return { action: 'ai_disabled', sent: false }
    }

    // Per-chat rate limit on the AI path.
    const { success: withinLimit } = await telegramAiRatelimit.limit(String(payload.chat_id))
    if (!withinLimit) {
      return { action: 'rate_limited', sent: false }
    }

    // Second idempotency guard before the outbound AI send.
    const claimKey = payload.update_id != null ? `router:sent:tg:${payload.update_id}` : null
    if (claimKey) {
      try {
        const claimed = await redis.set(claimKey, '1', { nx: true, ex: 60 * 60 * 24 })
        if (claimed === null) return { action: 'ai', sent: false, reason: 'duplicate' }
      } catch {
        // Redis unavailable: proceed rather than drop the answer.
      }
    }

    try {
      const { answer } = await answerCrewQuestion({
        tour_id: payload.tour_id,
        person_id: payload.person_id,
        question: payload.body,
      })

      await sendTelegramMessage({ chatId: payload.chat_id, text: answer })
    } catch (err) {
      // Release the claim so a Trigger.dev retry can attempt this again,
      // whether the AI call or the send itself failed.
      if (claimKey) {
        try {
          await redis.del(claimKey)
        } catch {
          // Redis unavailable: nothing to release.
        }
      }
      throw err
    }

    return { action: 'ai', sent: true }
  },
})
