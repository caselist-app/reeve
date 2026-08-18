import { renderMorningMessageEmail } from '@/lib/comms/templates/morning-message-email'
import { renderBoardingPassMessage, renderBoardingPassEmail } from '@/lib/comms/templates/boarding-pass'
import {
  openerTemplateName, openerBodyParams, openerTelegram,
  showInfoTemplateName, showInfoBodyParams, showInfoTelegram,
  cateringTemplateName, cateringBodyParams, cateringTelegram,
  wrapTemplateName, wrapBodyParams, wrapTelegram,
} from '@/lib/comms/templates/day-blocks'
import {
  guestRequestBody, guestRequestButtons, guestRequestEmailSubject,
} from '@/lib/comms/templates/guest-request-notification'
import { doorsNudgeBody } from '@/lib/comms/templates/guest-list-doors-nudge'
import type { ImplementedType, NotificationDataMap, NotificationDef } from './types'

// One entry per implemented notification type. Typed as a full record over
// ImplementedType, so adding a type to NotificationDataMap without a registry
// entry is a compile error. Renderers are optional: WhatsApp-only types (blocks)
// omit email(), and resolveChannels automatically filters that channel out.
type Registry = { [K in ImplementedType]: NotificationDef<NotificationDataMap[K]> }

export const registry: Registry = {
  morning_message: {
    timeCritical: false,
    // WhatsApp renderer removed: morning_message is now the email-only consolidated
    // digest. WhatsApp-preferring contacts receive the staggered block messages
    // (opener, show_information, catering, wrap) instead. resolveChannels drops
    // this type for WhatsApp contacts automatically because whatsapp() is absent.
    email: (d) => ({
      subject: `${d.venue_name} - ${d.show_date}`,
      html: renderMorningMessageEmail(d),
    }),
  },

  change_alert: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: process.env.WHATSAPP_TEMPLATE_BROADCAST ?? '',
      bodyParams: [d.message],
    }),
    email: (d) => ({
      subject: 'Change update',
      html: `<p>${d.message.replace(/\n/g, '<br>')}</p>`,
    }),
    telegram: (d) => ({ body: d.message }),
  },

  // Brief 31 (AirLabs): delay/cancellation/gate/terminal change alerts.
  // timeCritical, like bus_call/lobby_call: disruption info for a flight
  // already on the schedule is core value, not an optional broadcast, so it
  // bypasses operational-channel preference for whichever real-time channel
  // the person has. whatsapp() reuses the existing broadcast template (same
  // shape as change_alert): a proactive send outside the 24h reply window
  // must go through an approved template, and WHATSAPP_TEMPLATE_BROADCAST is
  // already approved and live for change_alert. No email() renderer: this is
  // a real-time nudge, not a formal document, same reasoning as the
  // day-blocks below.
  flight_status_alert: {
    timeCritical: true,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: process.env.WHATSAPP_TEMPLATE_BROADCAST ?? '',
      bodyParams: [d.message],
    }),
    telegram: (d) => ({ body: d.message }),
  },

  // Brief 52, step 7 (REE-134): a /guest request for the TM to approve or
  // decline. Telegram only for now (same reasoning as flight_status_alert):
  // whatsapp() would need an approved Meta template outside the 24h window, which
  // the brief says not to block on. The email() renderer supplies a subject for
  // the later digest path; nothing dispatches it yet. The two buttons carry
  // gl:a:<entryId> / gl:d:<entryId>, the callback the decide core reads.
  guest_request: {
    timeCritical: false,
    telegram: (d) => ({
      body: guestRequestBody(d),
      buttons: guestRequestButtons(d.entryId),
    }),
    email: (d) => ({
      subject: guestRequestEmailSubject(d),
      html: `<p>${guestRequestBody(d).replace(/\n/g, '<br>')}</p>`,
    }),
  },

  // Brief 52, step 10 (REE-137): the hourly before-doors nudge when guest
  // requests are still waiting. Telegram only, same reasoning as
  // flight_status_alert: a real-time nudge, not a formal document.
  guest_list_doors_nudge: {
    timeCritical: false,
    telegram: (d) => ({ body: doorsNudgeBody(d) }),
  },

  // --- Show-day blocks (WhatsApp/Telegram only: no email() renderer) ---
  // Each block fires independently based on what data exists for the day.
  // resolveChannels drops a channel for any block whose renderer is absent,
  // so email-only contacts receive only the morning_message digest.

  opener: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: openerTemplateName(),
      bodyParams: openerBodyParams(d),
    }),
    telegram: (d) => ({ body: openerTelegram(d) }),
  },

  show_information: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: showInfoTemplateName(d.variant),
      bodyParams: showInfoBodyParams(d),
    }),
    telegram: (d) => ({ body: showInfoTelegram(d) }),
  },

  catering: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: cateringTemplateName(d.variant),
      bodyParams: cateringBodyParams(d),
    }),
    telegram: (d) => ({ body: cateringTelegram(d) }),
  },

  wrap: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: wrapTemplateName(d.variant),
      bodyParams: wrapBodyParams(d),
    }),
    telegram: (d) => ({ body: wrapTelegram(d) }),
  },

  boarding_pass: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: process.env.WHATSAPP_TEMPLATE_BOARDING_PASS ?? '',
      bodyParams: [renderBoardingPassMessage(d)],
      ...(d.signedUrl ? { headerDocument: { link: d.signedUrl, filename: 'boarding-pass.pdf' } } : {}),
    }),
    telegram: (d) => ({
      body: renderBoardingPassMessage(d),
      ...(d.signedUrl ? { documentUrl: d.signedUrl } : {}),
    }),
    email: async (d) => {
      const attachments: Array<{ filename: string; content: Buffer | string }> = []

      // Fetch the PDF from the signed URL so it can be attached directly.
      // The signed URL is pre-computed by the job with enough TTL to cover send time.
      if (d.signedUrl) {
        try {
          const res = await fetch(d.signedUrl)
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer())
            attachments.push({ filename: 'boarding-pass.pdf', content: buf.toString('base64') })
          }
        } catch {
          // Non-fatal: the email sends without the attachment rather than failing.
        }
      }

      return {
        subject: `Boarding pass: ${d.leg_label}`,
        html: renderBoardingPassEmail(d),
        attachments,
      }
    },
  },
}
