import { renderMorningMessage } from '@/lib/comms/templates/morning-message'
import { renderMorningMessageEmail } from '@/lib/comms/templates/morning-message-email'
import type { ImplementedType, NotificationDataMap, NotificationDef } from './types'

// One entry per implemented notification type. Typed as a full record over
// ImplementedType, so adding a type to NotificationDataMap without giving it
// both a WhatsApp and an email renderer is a compile error. That is the
// guarantee that keeps a channel from being half-wired.
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
}
