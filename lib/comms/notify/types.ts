import type { QuickReplyButton } from '@/lib/comms/whatsapp'
import type { EmailAttachment } from '@/lib/comms/email'
import type { MorningMessageData } from '@/lib/comms/templates/morning-message'

// A notification can leave on one or both of these. SMS was retired; new
// channels (push, etc.) slot in by extending this union and the adapters.
export type Channel = 'whatsapp' | 'email'

// Every notification the service can send. A type is "implemented" once it has
// a data shape in NotificationDataMap and an entry in the registry.
export type NotificationType =
  | 'morning_message'
  | 'boarding_pass'
  | 'travel_confirmation'
  | 'change_alert'
  | 'hotel_details'
  | 'bus_call'
  | 'lobby_call'

// The data each notification type renders from. Entries are added as each type
// is built; the registry is keyed off this, so adding a type here forces the
// compiler to demand both a WhatsApp and an email renderer for it.
export interface NotificationDataMap {
  morning_message: MorningMessageData
}

export type ImplementedType = keyof NotificationDataMap

// Channel-agnostic rendered payloads the adapters know how to send.
export type RenderedWhatsApp =
  | { kind: 'text'; body: string }
  | { kind: 'interactive'; body: string; buttons: [QuickReplyButton, ...QuickReplyButton[]] }
  | { kind: 'template'; templateName: string; bodyParams: string[]; headerDocument?: { link: string; filename: string } }

export interface RenderedEmail {
  subject: string
  html: string
  attachments?: EmailAttachment[]
}

export interface NotificationDef<D> {
  // Time-critical nudges (bus_call, lobby_call) prefer WhatsApp regardless of
  // the person's preference; email is used only when they have no number.
  timeCritical: boolean
  // Renderers are optional: block types are WhatsApp-only (no email() renderer),
  // and resolveChannels drops a channel when its renderer is absent.
  whatsapp?(data: D): RenderedWhatsApp | Promise<RenderedWhatsApp>
  email?(data: D): RenderedEmail | Promise<RenderedEmail>
}

// The recipient, resolved through the people -> contacts join. Identity and
// channel preference live on the contact (Brief 20); person_id is the tour
// membership the notification is keyed to.
export interface Recipient {
  personId: string
  name: string
  whatsappNumber: string | null
  email: string | null
  preferredChannel: 'whatsapp' | 'email' | 'both'
}
