import { describe, it, expect } from 'vitest'
import { renderRiderEmail } from '@/lib/comms/templates/rider-email'

// REE-304. The greeting line assumed every document was an advance document,
// so a General or Marketing send still read "please review the advance
// document below". The line must read correctly regardless of document kind.

describe('renderRiderEmail', () => {
  it('does not call the document an advance document', () => {
    const html = renderRiderEmail({
      recipientName: 'Jamie Rivers',
      artistName: 'The Wandering Sound',
      documentTitle: 'Marketing Assets Pack',
      shareUrl: 'https://example.com/share/abc123',
    })

    expect(html).toContain('has shared this with you')
    expect(html).not.toContain('advance document')
  })
})
