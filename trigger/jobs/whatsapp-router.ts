import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { redis } from '@/lib/redis'
import { whatsappAiRatelimit } from '@/lib/ratelimit'
import { routeInbound } from '@/lib/comms/router'
import { sendWhatsApp, sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import { answerCrewQuestion } from '@/lib/ai/answer'

export type WhatsAppRouterPayload = {
  tour_id: string
  person_id: string
  from_number: string
  body: string
  wamid: string | null
}

// Processes an inbound WhatsApp message after the webhook handler has verified
// the signature, mapped the number to a person, and returned 200.
// Slash commands render from data with zero AI. Free text goes to Claude only
// when the TM has enabled inbound_qa_enabled on this tour.
export const whatsappRouterJob = task({
  id: 'whatsapp-router',
  run: async (payload: WhatsAppRouterPayload) => {
    const result = await routeInbound({
      from_number: payload.from_number,
      body: payload.body,
      tour_id: payload.tour_id,
      person_id: payload.person_id,
    })

    if (result.action === 'template') {
      // Second idempotency guard before the outbound send.
      // The webhook guard covers most retries; this covers job-level retries.
      if (payload.wamid) {
        try {
          const claimed = await redis.set(`router:sent:${payload.wamid}`, '1', { nx: true, ex: 60 * 60 * 24 })
          if (claimed === null) return { action: 'template', sent: false, reason: 'duplicate' }
        } catch {
          // Redis unavailable: proceed rather than drop a command reply.
        }
      }

      // Attach quick-reply buttons so the crew member can tap common commands
      // without typing. Button taps arrive as interactive messages and are
      // routed identically to typed slash commands.
      await sendInteractiveWhatsApp({
        to: payload.from_number,
        body: result.reply,
        buttons: [
          { id: 'itinerary', title: '/itinerary' },
          { id: 'travel', title: '/travel' },
          { id: 'hotel', title: '/hotel' },
        ],
      })
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

    // Per-number rate limit on the AI path.
    const { success: withinLimit } = await whatsappAiRatelimit.limit(payload.from_number)
    if (!withinLimit) {
      return { action: 'rate_limited', sent: false }
    }

    // Second idempotency guard before the outbound AI send.
    if (payload.wamid) {
      try {
        const claimed = await redis.set(`router:sent:${payload.wamid}`, '1', { nx: true, ex: 60 * 60 * 24 })
        if (claimed === null) return { action: 'ai', sent: false, reason: 'duplicate' }
      } catch {
        // Redis unavailable: proceed rather than drop the answer.
      }
    }

    const { answer } = await answerCrewQuestion({
      tour_id: payload.tour_id,
      person_id: payload.person_id,
      question: payload.body,
    })

    await sendWhatsApp({ to: payload.from_number, body: answer })
    return { action: 'ai', sent: true }
  },
})
