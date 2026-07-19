import { renderMorningMessage } from '@/lib/comms/templates/morning-message'
import { renderMorningMessageEmail } from '@/lib/comms/templates/morning-message-email'
import { renderBoardingPassMessage, renderBoardingPassEmail } from '@/lib/comms/templates/boarding-pass'
import { buildChangeMessage } from '@/lib/comms/templates/change-alert'
import type { ImplementedType, NotificationDataMap, NotificationDef } from './types'

// One entry per implemented notification type. Typed as a full record over
// ImplementedType, so adding a type to NotificationDataMap without a registry
// entry is a compile error. Renderers are optional: WhatsApp-only types (blocks)
// omit email(), and resolveChannels automatically filters that channel out.
type Registry = { [K in ImplementedType]: NotificationDef<NotificationDataMap[K]> }

export const registry: Registry = {
  morning_message: {
    timeCritical: false,
    whatsapp: (d) => ({
      kind: 'interactive',
      body: renderMorningMessage(d),
      buttons: [
        { id: 'itinerary', title: '/itinerary' },
        { id: 'travel', title: '/travel' },
        { id: 'hotel', title: '/hotel' },
      ],
    }),
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
