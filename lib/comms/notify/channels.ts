import type { Channel, NotificationDef, Recipient } from './types'

// Decides which channels a notification actually leaves on, in order:
//   1. preference -> candidate channels (whatsapp | email | both)
//   2. drop any channel the recipient has no address for
//   3. drop any channel the notification type has no renderer for
//      (block types are WhatsApp-only; this makes them invisible to email-only contacts)
//   4. time-critical nudges force WhatsApp when a number exists; email is the
//      fallback only for people with no WhatsApp number
// Pure and side-effect free so it is trivially unit-testable.
export function resolveChannels(
  recipient: Recipient,
  def: Pick<NotificationDef<unknown>, 'timeCritical' | 'whatsapp' | 'email'>
): Channel[] {
  const hasWhatsApp = !!recipient.whatsappNumber
  const hasEmail = !!recipient.email

  if (def.timeCritical) {
    if (hasWhatsApp && def.whatsapp) return ['whatsapp']
    if (hasEmail && def.email) return ['email']
    return []
  }

  const candidates: Channel[] =
    recipient.preferredChannel === 'whatsapp'
      ? ['whatsapp']
      : recipient.preferredChannel === 'email'
        ? ['email']
        : ['whatsapp', 'email']

  return candidates.filter((c) => {
    const hasAddress = (c === 'whatsapp' && hasWhatsApp) || (c === 'email' && hasEmail)
    const hasRenderer = c === 'whatsapp' ? !!def.whatsapp : !!def.email
    return hasAddress && hasRenderer
  })
}
