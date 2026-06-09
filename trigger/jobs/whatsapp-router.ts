import { task } from '@trigger.dev/sdk/v3'
import { routeInbound } from '@/lib/comms/router'
import { sendWhatsApp, sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import { answerCrewQuestion } from '@/lib/ai/answer'

export type WhatsAppRouterPayload = {
  tour_id: string
  person_id: string
  from_number: string
  body: string
}

// Processes an inbound WhatsApp message after the webhook handler has verified
// the signature, mapped the number to a person, and returned 200.
// Slash commands render from data with zero AI. Free text goes to Claude.
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

    // Free text: assemble tour context and call Claude.
    const { answer } = await answerCrewQuestion({
      tour_id: payload.tour_id,
      person_id: payload.person_id,
      question: payload.body,
    })

    await sendWhatsApp({ to: payload.from_number, body: answer })
    return { action: 'ai', sent: true }
  },
})
