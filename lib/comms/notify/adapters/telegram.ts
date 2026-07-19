import { sendTelegramMessage } from '@/lib/comms/telegram'
import type { RenderedTelegram } from '../types'

// Sends a rendered Telegram payload and returns the provider message id for
// receipt tracking. No env-var-gated template lookup like the WhatsApp
// adapter: there is no approval step to gate on, every send is just a message.
export async function sendTelegramRendered(
  chatId: number,
  rendered: RenderedTelegram
): Promise<{ providerMessageId: string | null }> {
  const { messageId } = await sendTelegramMessage({
    chatId,
    text: rendered.body,
    buttons: rendered.buttons,
  })

  return { providerMessageId: String(messageId) }
}
