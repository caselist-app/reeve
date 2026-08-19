import type { Channel, NotificationDef, Recipient } from './types'

// Decides which channels a notification actually leaves on, in order:
//   1. time-critical nudges still go to the one operational channel the contact
//      chose (WhatsApp or Telegram), not whichever real-time channel they happen
//      to have an address for. A Telegram contact who also has a WhatsApp number
//      gets a Telegram flight alert, not a WhatsApp one. What time-critical
//      changes is that it skips formal email (email_enabled is not consulted)
//      and returns a single channel: email is a last resort only when the
//      operational channel is unreachable or unset.
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
  def: Pick<NotificationDef<unknown>, 'timeCritical' | 'whatsapp' | 'email' | 'telegram' | 'alwaysEmail'>
): Channel[] {
  const hasWhatsApp = !!recipient.whatsappNumber
  const hasTelegram = !!recipient.telegramChatId
  const hasEmail = !!recipient.email
  const op = recipient.operationalChannel

  if (def.timeCritical) {
    // Respect the explicit operational-channel choice: the urgency justifies
    // skipping email, not overriding which real-time channel the contact picked.
    if (op === 'whatsapp' && hasWhatsApp && def.whatsapp) return ['whatsapp']
    if (op === 'telegram' && hasTelegram && def.telegram) return ['telegram']
    // Operational channel unset or its address missing: fall back to email so a
    // time-critical alert is not silently dropped.
    if (hasEmail && def.email) return ['email']
    return []
  }

  const candidates: Channel[] = []
  if (recipient.operationalChannel) candidates.push(recipient.operationalChannel)
  if (recipient.emailEnabled || def.alwaysEmail) candidates.push('email')

  return candidates.filter((c) => {
    const hasAddress =
      (c === 'whatsapp' && hasWhatsApp) ||
      (c === 'telegram' && hasTelegram) ||
      (c === 'email' && hasEmail)
    const hasRenderer = c === 'whatsapp' ? !!def.whatsapp : c === 'telegram' ? !!def.telegram : !!def.email
    return hasAddress && hasRenderer
  })
}
