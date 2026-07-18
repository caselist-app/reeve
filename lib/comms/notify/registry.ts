import { renderMorningMessage } from '@/lib/comms/templates/morning-message'
import { renderMorningMessageEmail } from '@/lib/comms/templates/morning-message-email'
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
}
