import { sendWhatsApp, sendTemplate, sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import type { RenderedWhatsApp } from '../types'

// Sends a rendered WhatsApp payload and returns the provider message id (wamid)
// for receipt tracking. All proactive sends must use approved Meta templates so
// they deliver outside the 24-hour customer-service window.
//
// For kind: 'template', the renderer supplies its own template name via the
// process.env lookup it does internally. If the env var is unset the renderer
// passes an empty/undefined templateName and this function returns skipped: true
// so notify() releases the claim for a later retry.
export async function sendWhatsAppRendered(
  to: string,
  rendered: RenderedWhatsApp
): Promise<{ providerMessageId: string | null; skipped?: true }> {
  switch (rendered.kind) {
    case 'text': {
      const { wamid } = await sendWhatsApp({ to, body: rendered.body })
      return { providerMessageId: wamid }
    }

    case 'interactive': {
      await sendInteractiveWhatsApp({ to, body: rendered.body, buttons: rendered.buttons })
      return { providerMessageId: null }
    }

    case 'template': {
      if (!rendered.templateName) {
        console.warn('[whatsapp-adapter] template send skipped: templateName not configured')
        return { providerMessageId: null, skipped: true }
      }
      const { wamid } = await sendTemplate({
        to,
        templateName: rendered.templateName,
        languageCode: 'en',
        bodyParams: rendered.bodyParams,
        ...(rendered.headerDocument ? { headerDocument: rendered.headerDocument } : {}),
      })
      return { providerMessageId: wamid }
    }
  }
}
