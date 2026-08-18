// Mirrors lib/comms/guest-callback.ts's shape for the dc: prefix. A tapped
// button's callback_data is untrusted input off the wire, so this never
// throws: an unknown prefix or a malformed id is a null, not an exception.

export type ParsedDisconnectCallback = { action: 'cancel' } | { action: 'confirm'; contactId: string }

// dc:n (cancel) and dc:y:<uuid> (confirm). The id is validated as a uuid so a
// malformed payload is rejected here rather than handed to a query that
// would return nothing anyway. Anchored, so trailing junk does not slip a
// bad id through.
const CANCEL_RE = /^dc:n$/
const CONFIRM_RE = /^dc:y:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

export function parseDisconnectCallback(data: string): ParsedDisconnectCallback | null {
  const input = data ?? ''

  if (CANCEL_RE.test(input)) {
    return { action: 'cancel' }
  }

  const match = CONFIRM_RE.exec(input)
  if (match) {
    return { action: 'confirm', contactId: match[1] }
  }

  return null
}
