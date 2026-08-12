import { describe, it, expect } from 'vitest'
import { parseGuestCallback } from '@/lib/comms/guest-callback'
import { guestRequestButtons } from '@/lib/comms/templates/guest-request-notification'

// Brief 52, step 8 (REE-135). The parser is the inverse of guestRequestButtons,
// so the two are pinned together: whatever the notification writes, this reads.
// A tapped button is untrusted input, so every malformed shape yields null and
// nothing here throws.

const ENTRY_ID = '11111111-2222-3333-4444-555555555555'

describe('parseGuestCallback', () => {
  it('reads a valid approve payload', () => {
    expect(parseGuestCallback(`gl:a:${ENTRY_ID}`)).toEqual({
      decision: 'approve',
      entryId: ENTRY_ID,
    })
  })

  it('reads a valid decline payload', () => {
    expect(parseGuestCallback(`gl:d:${ENTRY_ID}`)).toEqual({
      decision: 'decline',
      entryId: ENTRY_ID,
    })
  })

  it('round-trips the buttons the notification actually sends', () => {
    const [approve, decline] = guestRequestButtons(ENTRY_ID)
    expect(parseGuestCallback(approve.callback_data)).toEqual({
      decision: 'approve',
      entryId: ENTRY_ID,
    })
    expect(parseGuestCallback(decline.callback_data)).toEqual({
      decision: 'decline',
      entryId: ENTRY_ID,
    })
  })

  it('returns null for an unknown prefix rather than throwing', () => {
    expect(parseGuestCallback(`/itinerary`)).toBeNull()
    expect(parseGuestCallback(`gl:x:${ENTRY_ID}`)).toBeNull()
    expect(parseGuestCallback(`xx:a:${ENTRY_ID}`)).toBeNull()
  })

  it('returns null for a malformed uuid rather than throwing', () => {
    expect(parseGuestCallback('gl:a:not-a-uuid')).toBeNull()
    expect(parseGuestCallback('gl:a:11111111-2222-3333-4444')).toBeNull()
    expect(parseGuestCallback(`gl:a:${ENTRY_ID}-trailing`)).toBeNull()
  })

  it('returns null for empty or junk input rather than throwing', () => {
    expect(parseGuestCallback('')).toBeNull()
    expect(parseGuestCallback('gl:')).toBeNull()
    expect(parseGuestCallback('gl:a:')).toBeNull()
  })
})
