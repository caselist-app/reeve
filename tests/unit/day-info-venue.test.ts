import { describe, it, expect } from 'vitest'
import { venueSectionState } from '@/lib/schedule/day-info-venue'

// The venue section of day info knows the day type. Only a show day has a venue
// to speak of; every other type has no venue section at all, rather than the old
// unconditional "No show on this date." sentence that fired on a travel day, a
// press day and a day off as if a venue were missing there.
describe('venueSectionState', () => {
  // Red first: the current unconditional behaviour returns a "No show on this
  // date." string for a travel day with no show. This pins that a travel day is
  // absent, which that behaviour fails.
  it('is absent on a travel day with no show', () => {
    expect(venueSectionState('travel', false)).toEqual({ kind: 'absent' })
  })

  it('is venue on a show day with a show row', () => {
    expect(venueSectionState('show', true)).toEqual({ kind: 'venue' })
  })

  it('is needs-venue on a show day with no show row', () => {
    expect(venueSectionState('show', false)).toEqual({ kind: 'needs-venue' })
  })

  // Every non-show day type is absent regardless of hasShow. hasShow cannot be
  // true on these in practice, but the function is total, so both are pinned.
  it.each([
    ['rehearsal', true],
    ['rehearsal', false],
    ['travel', true],
    ['press', true],
    ['press', false],
    ['day_off', true],
    ['day_off', false],
  ] as const)('is absent on a %s day (hasShow=%s)', (dayType, hasShow) => {
    expect(venueSectionState(dayType, hasShow)).toEqual({ kind: 'absent' })
  })
})
