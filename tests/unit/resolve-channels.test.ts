import { describe, it, expect } from 'vitest'
import { resolveChannels } from '@/lib/comms/notify/channels'
import type { Recipient, NotificationDef } from '@/lib/comms/notify/types'

// resolveChannels is the single funnel every send passes through, so the model
// ("one operational channel plus independent email") only holds if this matrix
// holds. Each case is a (recipient, def) pair with the channels it must resolve.

// A recipient with everything present; individual cases null out what they test.
function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    personId: 'p1',
    name: 'Jordan',
    whatsappNumber: '+447700900123',
    telegramChatId: 12345,
    email: 'jordan@example.com',
    operationalChannel: 'whatsapp',
    emailEnabled: false,
    ...overrides,
  }
}

// The renderer's presence, not its output, is what resolveChannels reads. A
// truthy function per channel stands in for a real renderer.
type Def = Pick<NotificationDef<unknown>, 'timeCritical' | 'whatsapp' | 'email' | 'telegram'>
const render = () => ({}) as never

// A day-block type: WhatsApp and Telegram renderers, no email one.
const blockDef: Def = { timeCritical: false, whatsapp: render, telegram: render }
// A type with all three renderers, e.g. a change alert.
const allDef: Def = { timeCritical: false, whatsapp: render, telegram: render, email: render }
// A time-critical type with all three renderers, e.g. a flight status alert.
const urgentDef: Def = { timeCritical: true, whatsapp: render, telegram: render, email: render }

describe('resolveChannels: operational channel', () => {
  it('sends on the chosen WhatsApp operational channel', () => {
    expect(resolveChannels(recipient({ operationalChannel: 'whatsapp' }), blockDef)).toEqual(['whatsapp'])
  })

  it('sends on the chosen Telegram operational channel, not WhatsApp', () => {
    // The contact has a WhatsApp number too, but chose Telegram. The number
    // must not win over the explicit choice.
    expect(resolveChannels(recipient({ operationalChannel: 'telegram' }), blockDef)).toEqual(['telegram'])
  })

  it('sends nothing operational when no channel is chosen', () => {
    // operational_channel = null is a real state and means no operational
    // messages, even though the contact has both addresses.
    expect(resolveChannels(recipient({ operationalChannel: null }), blockDef)).toEqual([])
  })

  it('drops the operational channel when its address is missing', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: 'whatsapp', whatsappNumber: null }), blockDef)
    ).toEqual([])
  })

  it('drops the operational channel when the type has no renderer for it', () => {
    // A type with only an email renderer cannot go out on WhatsApp.
    const emailOnly: Def = { timeCritical: false, email: render }
    expect(resolveChannels(recipient({ operationalChannel: 'whatsapp' }), emailOnly)).toEqual([])
  })
})

describe('resolveChannels: email is independent', () => {
  it('adds email alongside the operational channel when enabled', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: 'whatsapp', emailEnabled: true }), allDef)
    ).toEqual(['whatsapp', 'email'])
  })

  it('omits email when disabled, even with an address', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: 'whatsapp', emailEnabled: false }), allDef)
    ).toEqual(['whatsapp'])
  })

  it('sends email alone when enabled and no operational channel is chosen', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: null, emailEnabled: true }), allDef)
    ).toEqual(['email'])
  })

  it('drops email when enabled but the type has no email renderer', () => {
    // Day blocks are WhatsApp/Telegram-only; an email-preferring contact on a
    // block type gets only their operational channel.
    expect(
      resolveChannels(recipient({ operationalChannel: 'telegram', emailEnabled: true }), blockDef)
    ).toEqual(['telegram'])
  })

  it('drops email when enabled but no address is present', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: 'whatsapp', emailEnabled: true, email: null }), allDef)
    ).toEqual(['whatsapp'])
  })
})

describe('resolveChannels: time-critical', () => {
  it('uses the chosen operational channel, not whichever address exists', () => {
    // The regression this ticket fixes: a Telegram contact with a WhatsApp
    // number got a WhatsApp flight alert. It must go to Telegram.
    expect(resolveChannels(recipient({ operationalChannel: 'telegram' }), urgentDef)).toEqual(['telegram'])
  })

  it('uses WhatsApp when that is the chosen channel', () => {
    expect(resolveChannels(recipient({ operationalChannel: 'whatsapp' }), urgentDef)).toEqual(['whatsapp'])
  })

  it('skips formal email: never fires both, ignores email_enabled', () => {
    // A time-critical nudge is a single real-time channel, not a formal email
    // as well, regardless of the email_enabled preference.
    expect(
      resolveChannels(recipient({ operationalChannel: 'whatsapp', emailEnabled: true }), urgentDef)
    ).toEqual(['whatsapp'])
  })

  it('falls back to email when no operational channel is chosen', () => {
    // An urgent alert should not be silently dropped for a contact who never
    // set a channel but has an email address.
    expect(resolveChannels(recipient({ operationalChannel: null }), urgentDef)).toEqual(['email'])
  })

  it('falls back to email when the chosen channel has no address', () => {
    expect(
      resolveChannels(recipient({ operationalChannel: 'telegram', telegramChatId: null }), urgentDef)
    ).toEqual(['email'])
  })

  it('resolves to nothing when neither the chosen channel nor email is reachable', () => {
    expect(
      resolveChannels(
        recipient({ operationalChannel: 'whatsapp', whatsappNumber: null, email: null }),
        urgentDef
      )
    ).toEqual([])
  })
})
