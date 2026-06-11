import { sendTemplate, sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import type { RenderedWhatsApp } from '../types'

// Template ID for the approved Meta morning-message template.
// Set in env once Meta approves. Until then, proactive sends are skipped.
const MORNING_MESSAGE_TEMPLATE = process.env.WHATSAPP_TEMPLATE_MORNING_MESSAGE

// Sends a rendered WhatsApp payload and returns the provider message id (wamid)
// for receipt tracking. Text sends use the approved template so they deliver
// outside the 24-hour Meta window. If the template is not yet configured,
// the send is skipped and the caller's claim is released by the notify() caller.
export async function sendWhatsAppRendered(
  to: string,
  rendered: RenderedWhatsApp
): Promise<{ providerMessageId: string | null; skipped?: true }> {
  if (rendered.kind === 'interactive') {
    await sendInteractiveWhatsApp({ to, body: rendered.body, buttons: rendered.buttons })
    return { providerMessageId: null }
  }

  // Proactive text sends (morning messages) must use an approved template.
  if (!MORNING_MESSAGE_TEMPLATE) {
    console.warn('[whatsapp-adapter] WHATSAPP_TEMPLATE_MORNING_MESSAGE not configured, skipping send')
    return { providerMessageId: null, skipped: true }
  }

  const { wamid } = await sendTemplate({
    to,
    templateName: MORNING_MESSAGE_TEMPLATE,
    languageCode: 'en',
    bodyParams: [rendered.body],
  })
  return { providerMessageId: wamid }
}
