import type { Channel, Recipient } from './types'

// Decides which channels a notification actually leaves on, in order:
//   1. preference -> candidate channels (whatsapp | email | both)
//   2. drop any channel the recipient has no address for
//   3. time-critical nudges force WhatsApp when a number exists; email is the
//      fallback only for people with no WhatsApp number
// Pure and side-effect free so it is trivially unit-testable.
export function resolveChannels(recipient: Recipient, timeCritical: boolean): Channel[] {
  const hasWhatsApp = !!recipient.whatsappNumber
  const hasEmail = !!recipient.email

  if (timeCritical) {
    if (hasWhatsApp) return ['whatsapp']
    if (hasEmail) return ['email']
    return []
  }

  const candidates: Channel[] =
    recipient.preferredChannel === 'whatsapp'
      ? ['whatsapp']
      : recipient.preferredChannel === 'email'
        ? ['email']
        : ['whatsapp', 'email']

  return candidates.filter(
    (c) => (c === 'whatsapp' && hasWhatsApp) || (c === 'email' && hasEmail)
  )
}
