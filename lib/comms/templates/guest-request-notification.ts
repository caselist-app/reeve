import { passTypeLabel } from '@/lib/guest-list/vocabulary'
import type { TelegramButton } from '@/lib/comms/telegram'

// The message the TM gets when a crew member's /guest request lands on their
// list. Brief 52, step 7 (REE-134). Pure and unit tested: the producer in
// lib/comms/guest-request.ts assembles the data and hands the rendered payload
// to notifyAccount, and the registry entry wires these builders as the
// guest_request renderers.
//
// showDate is already formatted ("Friday 14 June") by the producer, so this
// stays free of any timezone reasoning: it is copy, not date maths.

export interface GuestRequestNotificationData {
  // The entry the two buttons act on. gl:a:<entryId> approves, gl:d:<entryId>
  // declines; a uuid keeps the callback_data at 41 bytes, under Telegram's 64.
  entryId: string
  guestName: string
  numTickets: number
  // The stored pass_type value. 'ticket' is the default and reads as a plain
  // ticket, so it is not spelled out; anything else names the pass.
  passType: string
  venueName: string | null
  showDate: string
  // Who asked, resolved through the requester's contact. Null when it could not
  // be resolved, in which case the line stays generic rather than naming nobody.
  requesterName: string | null
  // How many requests are now waiting on the TM for this show, including this
  // one. Surfaced only when there is more than one, so a single request does not
  // read as a backlog.
  waitingCount: number
}

function ticketPhrase(n: number): string {
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`
}

// The body: who asked, the guest and their count (with the pass when it is not a
// plain ticket), the show, and the waiting count when more than one is pending.
export function guestRequestBody(data: GuestRequestNotificationData): string {
  const who = data.requesterName ?? 'A crew member'
  const pass = data.passType && data.passType !== 'ticket' ? `, ${passTypeLabel(data.passType)}` : ''
  const lines = [
    `${who} asked for a guest.`,
    `${data.guestName}, ${ticketPhrase(data.numTickets)}${pass}`,
    `${data.venueName ?? 'The show'}, ${data.showDate}`,
  ]
  if (data.waitingCount > 1) {
    lines.push(`${data.waitingCount} requests waiting.`)
  }
  return lines.join('\n')
}

// The two inline-keyboard buttons. gl:a: and gl:d: plus the entry id, nothing
// positional: a list index in the payload goes stale the moment the list moves,
// so the id is the only durable reference.
export function guestRequestButtons(entryId: string): [TelegramButton, TelegramButton] {
  return [
    { text: 'Approve', callback_data: `gl:a:${entryId}` },
    { text: 'Decline', callback_data: `gl:d:${entryId}` },
  ]
}

export function guestRequestEmailSubject(data: GuestRequestNotificationData): string {
  return `Guest request for ${data.venueName ?? 'the show'}: ${data.guestName}`
}
