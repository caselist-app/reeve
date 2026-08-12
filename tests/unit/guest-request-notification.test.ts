import { describe, it, expect } from 'vitest'
import {
  guestRequestBody,
  guestRequestButtons,
  guestRequestEmailSubject,
  type GuestRequestNotificationData,
} from '@/lib/comms/templates/guest-request-notification'
import { registry } from '@/lib/comms/notify/registry'

// Brief 52, step 7 (REE-134). The message the TM gets when a /guest request lands.
// Pure renderer, so it is unit tested here: the body has to name the guest, the
// ticket count, the venue and who asked, and the two buttons have to carry
// gl:a:/gl:d: with the entry id, each under Telegram's 64 byte callback_data cap.

const ENTRY_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function data(overrides: Partial<GuestRequestNotificationData> = {}): GuestRequestNotificationData {
  return {
    entryId: ENTRY_ID,
    guestName: 'Dave Smith',
    numTickets: 3,
    passType: 'ticket',
    venueName: 'Brixton Academy',
    showDate: 'Friday 14 June',
    requesterName: 'Test Crew',
    waitingCount: 1,
    ...overrides,
  }
}

describe('guestRequestBody', () => {
  it('names the guest, the ticket count, the venue and who asked', () => {
    const body = guestRequestBody(data())
    expect(body).toContain('Dave Smith')
    expect(body).toContain('3 tickets')
    expect(body).toContain('Brixton Academy')
    expect(body).toContain('Test Crew')
  })

  it('singularises a one-ticket request', () => {
    expect(guestRequestBody(data({ numTickets: 1 }))).toContain('1 ticket')
    expect(guestRequestBody(data({ numTickets: 1 }))).not.toContain('1 tickets')
  })

  it('names the pass only when it is not a plain ticket', () => {
    expect(guestRequestBody(data({ passType: 'aaa' }))).toContain('AAA')
    expect(guestRequestBody(data({ passType: 'ticket' }))).not.toContain('Ticket')
  })

  it('surfaces the waiting count only when more than one is pending', () => {
    expect(guestRequestBody(data({ waitingCount: 3 }))).toContain('3 requests waiting')
    expect(guestRequestBody(data({ waitingCount: 1 }))).not.toContain('waiting')
  })

  it('stays generic when the requester could not be resolved', () => {
    const body = guestRequestBody(data({ requesterName: null }))
    expect(body).toContain('A crew member')
  })
})

describe('guestRequestButtons', () => {
  it('carries gl:a: and gl:d: with the entry id', () => {
    const [approve, decline] = guestRequestButtons(ENTRY_ID)
    expect(approve.callback_data).toBe(`gl:a:${ENTRY_ID}`)
    expect(decline.callback_data).toBe(`gl:d:${ENTRY_ID}`)
    expect(approve.text).toBe('Approve')
    expect(decline.text).toBe('Decline')
  })

  it('keeps each callback_data under Telegram\'s 64 byte limit', () => {
    for (const button of guestRequestButtons(ENTRY_ID)) {
      expect(Buffer.byteLength(button.callback_data, 'utf8')).toBeLessThan(64)
    }
  })
})

describe('guestRequestEmailSubject', () => {
  it('names the venue and the guest', () => {
    const subject = guestRequestEmailSubject(data())
    expect(subject).toContain('Brixton Academy')
    expect(subject).toContain('Dave Smith')
  })
})

describe('registry guest_request renderer', () => {
  it('renders the Telegram body and both buttons from the registry entry', async () => {
    const rendered = await registry.guest_request.telegram!(data())
    expect(rendered.body).toContain('Dave Smith')
    expect(rendered.buttons).toHaveLength(2)
    expect(rendered.buttons![0].callback_data).toBe(`gl:a:${ENTRY_ID}`)
    expect(rendered.buttons![1].callback_data).toBe(`gl:d:${ENTRY_ID}`)
  })
})
