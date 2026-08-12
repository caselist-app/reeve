import { describe, it, expect } from 'vitest'
import { selectOpenCount } from '@/stores/inbox-count-store'

// The pure half of the nav badge's optimistic count (REE-151). The badge is
// server-rendered in app/(app)/layout.tsx, above every route that can resolve
// an item, so a resolve writes an override here instead of trying to repaint
// the layout (REE-65, REE-131). selectOpenCount decides whether that override
// still applies: it does only while the server value it was computed against
// (basedOn) still matches what the layout last rendered.
describe('selectOpenCount', () => {
  it('returns the server value when there is no override', () => {
    expect(selectOpenCount(4, null)).toBe(4)
  })

  it('returns the override value when basedOn matches the server value', () => {
    expect(selectOpenCount(4, { basedOn: 4, value: 3 })).toBe(3)
  })

  it('ignores the override once the server value has moved past basedOn', () => {
    expect(selectOpenCount(5, { basedOn: 4, value: 3 })).toBe(5)
  })

  it('clamps a negative override to zero', () => {
    expect(selectOpenCount(0, { basedOn: 0, value: -1 })).toBe(0)
  })
})
