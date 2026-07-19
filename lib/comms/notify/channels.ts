import type { Channel, NotificationDef, Recipient } from './types'

// Decides which channels a notification actually leaves on, in order:
//   1. time-critical nudges bypass preference entirely: whichever real-time
//      channel (WhatsApp, then Telegram) the person has an address for, email
//      only when they have neither
//   2. otherwise, the operational channel (WhatsApp or Telegram, whichever
//      the contact has chosen) and formal email are independent: both can
//      fire for the same notification
//   3. drop any channel the recipient has no address for
//   4. drop any channel the notification type has no renderer for
//      (block types are WhatsApp/Telegram-only; this makes them invisible to
//      email-only contacts)
// Pure and side-effect free so it is trivially unit-testable.
export function resolveChannels(
  recipient: Recipient,
  def: Pick<NotificationDef<unknown>, 'timeCritical' | 'whatsapp' | 'email' | 'telegram'>
): Channel[] {
  const hasWhatsApp = !!recipient.whatsappNumber
  const hasTelegram = !!recipient.telegramChatId
  const hasEmail = !!recipient.email

  if (def.timeCritical) {
    if (hasWhatsApp && def.whatsapp) return ['whatsapp']
    if (hasTelegram && def.telegram) return ['telegram']
    if (hasEmail && def.email) return ['email']
    return []
  }

  const candidates: Channel[] = []
  if (recipient.operationalChannel) candidates.push(recipient.operationalChannel)
  if (recipient.emailEnabled) candidates.push('email')

  return candidates.filter((c) => {
    const hasAddress =
      (c === 'whatsapp' && hasWhatsApp) ||
      (c === 'telegram' && hasTelegram) ||
      (c === 'email' && hasEmail)
    const hasRenderer = c === 'whatsapp' ? !!def.whatsapp : c === 'telegram' ? !!def.telegram : !!def.email
    return hasAddress && hasRenderer
  })
}
