import { describe, it, expect } from 'vitest'
import { parseDisconnectCallback } from '@/lib/comms/disconnect-callback'

// REE-306. A tapped button's callback_data is untrusted input off the wire,
// so every malformed shape yields null and nothing here throws.

const CONTACT_ID = '11111111-2222-3333-4444-555555555555'

describe('parseDisconnectCallback', () => {
  it('reads a valid cancel payload', () => {
    expect(parseDisconnectCallback('dc:n')).toEqual({ action: 'cancel' })
  })

  it('reads a valid confirm payload', () => {
    expect(parseDisconnectCallback(`dc:y:${CONTACT_ID}`)).toEqual({
      action: 'confirm',
      contactId: CONTACT_ID,
    })
  })

  it('returns null for a malformed uuid rather than throwing', () => {
    expect(parseDisconnectCallback('dc:y:not-a-uuid')).toBeNull()
  })

  it('returns null for an unknown action letter rather than throwing', () => {
    expect(parseDisconnectCallback(`dc:z:${CONTACT_ID}`)).toBeNull()
  })

  it('returns null for the other prefix rather than throwing', () => {
    expect(parseDisconnectCallback(`gl:a:${CONTACT_ID}`)).toBeNull()
  })

  it('returns null for empty or junk input rather than throwing', () => {
    expect(parseDisconnectCallback('')).toBeNull()
    expect(parseDisconnectCallback('dc:')).toBeNull()
    expect(parseDisconnectCallback('dc:y:')).toBeNull()
    expect(parseDisconnectCallback('garbage')).toBeNull()
  })
})
