import { sendWhatsApp, sendInteractiveWhatsApp } from '@/lib/comms/whatsapp'
import type { RenderedWhatsApp } from '../types'

// Sends a rendered WhatsApp payload and returns the provider message id (wamid)
// for receipt tracking. Interactive sends do not yet surface a wamid from the
// underlying client, so they report null; once the morning message moves to an
// approved template (which does return a wamid), this will carry one.
export async function sendWhatsAppRendered(
  to: string,
  rendered: RenderedWhatsApp
): Promise<{ providerMessageId: string | null }> {
  if (rendered.kind === 'interactive') {
    await sendInteractiveWhatsApp({ to, body: rendered.body, buttons: rendered.buttons })
    return { providerMessageId: null }
  }

  const { wamid } = await sendWhatsApp({ to, body: rendered.body })
  return { providerMessageId: wamid }
}
