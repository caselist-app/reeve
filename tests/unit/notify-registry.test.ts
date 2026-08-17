import { describe, it, expect } from 'vitest'
import { registry } from '@/lib/comms/notify/registry'

// REE-236: flight_status_alert gains a whatsapp() renderer so a WhatsApp-preferring
// crew member receives the alert Telegram already gets. It reuses the existing
// broadcast template, same shape as change_alert.

describe('registry flight_status_alert renderer', () => {
  const message = 'Flight update: BA 123 (LHR to JFK)\nNow delayed. Gate: 12'

  it('renders a WhatsApp broadcast template with the message as the body param', () => {
    const rendered = registry.flight_status_alert.whatsapp!({ message })
    expect(rendered).toEqual({
      kind: 'template',
      templateName: process.env.WHATSAPP_TEMPLATE_BROADCAST ?? '',
      bodyParams: [message],
    })
  })

  it('still renders the Telegram body unchanged', () => {
    const rendered = registry.flight_status_alert.telegram!({ message })
    expect(rendered).toEqual({ body: message })
  })
})
