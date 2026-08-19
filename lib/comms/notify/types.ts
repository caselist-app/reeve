import type { QuickReplyButton } from '@/lib/comms/whatsapp'
import type { TelegramButton } from '@/lib/comms/telegram'
import type { EmailAttachment } from '@/lib/comms/email'
import type { MorningMessageData } from '@/lib/comms/templates/morning-message'
import type { BoardingPassNotificationData } from '@/lib/comms/templates/boarding-pass'
import type { OpenerData, ShowInfoData, CateringData, WrapData } from '@/lib/comms/templates/day-blocks'
import type { GuestRequestNotificationData } from '@/lib/comms/templates/guest-request-notification'
import type { DoorsNudgeData } from '@/lib/comms/templates/guest-list-doors-nudge'

// A notification can leave on one or more of these. SMS was retired; new
// channels slot in by extending this union and the adapters.
export type Channel = 'whatsapp' | 'email' | 'telegram'

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
  | 'opener'
  | 'show_information'
  | 'catering'
  | 'wrap'
  | 'flight_status_alert'
  | 'guest_request'
  | 'guest_list_doors_nudge'

// The data each notification type renders from. Entries are added as each type
// is built; the registry is keyed off this, so adding a type here forces the
// compiler to demand both a WhatsApp and an email renderer for it.
export interface NotificationDataMap {
  morning_message: MorningMessageData
  boarding_pass: BoardingPassNotificationData
  change_alert: { message: string }
  opener: OpenerData
  show_information: ShowInfoData
  catering: CateringData
  wrap: WrapData
  // Brief 31 (AirLabs): built entirely in trigger/jobs/flight-status-check.ts
  // (the message already describes exactly what changed), same shape as
  // change_alert deliberately - no separate structured fields needed yet.
  flight_status_alert: { message: string }
  // Brief 52 (REE-134): the /guest request landing on the TM's list. Sent to the
  // account holder's Telegram (notifyAccount), not to a crew person, so the
  // registry renderer is reused by the producer rather than dispatched through
  // notify(). Telegram only for now, same as flight_status_alert.
  guest_request: GuestRequestNotificationData
  // Brief 52, step 10 (REE-137): the hourly before-doors nudge when guest
  // requests are still waiting. Sent to the account holder's Telegram
  // (notifyAccount), same reasoning as guest_request and flight_status_alert:
  // a real-time nudge, not a formal document, so no email() renderer.
  guest_list_doors_nudge: DoorsNudgeData
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

// Simpler than RenderedWhatsApp: no template-kind distinction, since Telegram
// has no approval process and no positional-variable substitution to manage.
// documentUrl is the same signed Supabase Storage URL the WhatsApp renderer
// attaches as headerDocument; when present the adapter sends a document with
// body as its caption instead of a plain message.
export interface RenderedTelegram {
  body: string
  buttons?: TelegramButton[]
  documentUrl?: string
}

export interface NotificationDef<D> {
  // Time-critical nudges (bus_call, lobby_call, flight alerts) go to the one
  // operational channel the contact chose (WhatsApp or Telegram), skipping
  // formal email; email is used only when that channel is unset or unreachable.
  timeCritical: boolean
  // Bypasses the recipient's email_enabled preference in resolveChannels' non-
  // time-critical branch. For a type whose email is the thing that makes a
  // contact reachable at all (the roster welcome email), rather than content
  // they've opted into, since email_enabled defaults false.
  alwaysEmail?: boolean
  // Renderers are optional: block types are WhatsApp/Telegram-only (no
  // email() renderer), and resolveChannels drops a channel when its renderer
  // is absent.
  whatsapp?(data: D): RenderedWhatsApp | Promise<RenderedWhatsApp>
  email?(data: D): RenderedEmail | Promise<RenderedEmail>
  telegram?(data: D): RenderedTelegram | Promise<RenderedTelegram>
}

// The recipient, resolved through the people -> contacts join. Identity and
// channel preference live on the contact (Brief 20). operationalChannel and
// emailEnabled are independent (Brief 24): a contact can have an operational
// channel, formal emails, both, or neither. person_id is the tour membership
// the notification is keyed to.
export interface Recipient {
  personId: string
  name: string
  whatsappNumber: string | null
  telegramChatId: number | null
  email: string | null
  operationalChannel: 'whatsapp' | 'telegram' | null
  emailEnabled: boolean
}

// The raw people->contacts join shape notify() needs. A caller that already
// holds this (having fetched it for its own purposes) can pass it straight
// in and skip notify()'s own lookup. Same shape the join in notify() selects.
export interface NotifyContact {
  name: string
  whatsapp_number: string | null
  telegram_chat_id: number | null
  contact_email: string | null
  operational_channel: 'whatsapp' | 'telegram' | null
  email_enabled: boolean
}
