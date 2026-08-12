import type { GuestDecision } from '@/lib/guest-list/decide'

// The inverse of guestRequestButtons in lib/comms/templates/guest-request-notification.ts.
// That builder writes gl:a:<entryId> for Approve and gl:d:<entryId> for Decline;
// this reads a tapped button's callback_data back into a decision and an entry
// id. Brief 52, step 8 (REE-135).
//
// Pure and unit tested. It never throws: a callback_data is untrusted input off
// the wire, so an unknown prefix or a malformed id is a null, not an exception,
// and the inbound route falls through to crew logic on a null the same way it
// would for any other text.

export interface ParsedGuestCallback {
  decision: GuestDecision
  entryId: string
}

// gl:a:<uuid> and gl:d:<uuid>. The id is validated as a uuid so a malformed
// payload is rejected here rather than handed to a query that would return
// nothing anyway. Anchored, so trailing junk does not slip a bad id through.
const CALLBACK_RE = /^gl:(a|d):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function parseGuestCallback(data: string): ParsedGuestCallback | null {
  const match = CALLBACK_RE.exec(data ?? '')
  if (!match) return null

  return {
    decision: match[1].toLowerCase() === 'a' ? 'approve' : 'decline',
    entryId: match[2],
  }
}
