import { sendTelegramMessage, sendTelegramDocument } from '@/lib/comms/telegram'
import type { RenderedTelegram } from '../types'

// Sends a rendered Telegram payload and returns the provider message id for
// receipt tracking. No env-var-gated template lookup like the WhatsApp
// adapter: there is no approval step to gate on, every send is just a message
// or a document with a caption.
export async function sendTelegramRendered(
  chatId: number,
  rendered: RenderedTelegram
): Promise<{ providerMessageId: string | null }> {
  if (rendered.documentUrl) {
    const { messageId } = await sendTelegramDocument({
      chatId,
      documentUrl: rendered.documentUrl,
      caption: rendered.body,
    })
    return { providerMessageId: String(messageId) }
  }

  const { messageId } = await sendTelegramMessage({
    chatId,
    text: rendered.body,
    buttons: rendered.buttons,
  })

  return { providerMessageId: String(messageId) }
}
