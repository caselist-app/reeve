import { renderMorningMessageEmail } from '@/lib/comms/templates/morning-message-email'
import { renderBoardingPassMessage, renderBoardingPassEmail } from '@/lib/comms/templates/boarding-pass'
import { buildChangeMessage } from '@/lib/comms/templates/change-alert'
import {
  openerTemplateName, openerBodyParams,
  showInfoTemplateName, showInfoBodyParams,
  cateringTemplateName, cateringBodyParams,
  wrapTemplateName, wrapBodyParams,
} from '@/lib/comms/templates/day-blocks'
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
  },

  // --- Show-day blocks (WhatsApp-only: no email() renderer) ---
  // Each block fires independently based on what data exists for the day.
  // resolveChannels drops the WhatsApp channel for any block whose renderer
  // is absent, so email-only contacts receive only the morning_message digest.

  opener: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: openerTemplateName(),
      bodyParams: openerBodyParams(d),
    }),
  },

  show_information: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: showInfoTemplateName(d.variant),
      bodyParams: showInfoBodyParams(d),
    }),
  },

  catering: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: cateringTemplateName(d.variant),
      bodyParams: cateringBodyParams(d),
    }),
  },

  wrap: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: wrapTemplateName(d.variant),
      bodyParams: wrapBodyParams(d),
    }),
  },

  boarding_pass: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'template',
      templateName: process.env.WHATSAPP_TEMPLATE_BOARDING_PASS ?? '',
      bodyParams: [renderBoardingPassMessage(d)],
      ...(d.signedUrl ? { headerDocument: { link: d.signedUrl, filename: 'boarding-pass.pdf' } } : {}),
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
