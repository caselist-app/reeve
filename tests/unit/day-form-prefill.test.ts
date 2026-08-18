import { describe, it, expect } from 'vitest'
import { slotToDayFormClocks } from '@/lib/schedule/day-form-prefill'

// REE-69, REE-282. A drag on the empty grid has to seed the day form's Starts
// and Ends fields with the range it spanned, or the duration is lost and the
// item saves at the kind's synthesised end (the "60 mins dragged, 30 min block
// saved" bug). A click still seeds only the start. The clocks are 24-hour wall
// time in the tour's zone, read straight into the dedicated time inputs: there
// is no meridiem to state or guess, since REE-282 retired the free-text field
// those inputs used to feed through the parser.
//
// London in June is UTC+1, Auckland is UTC+12, which is what makes the zone
// argument bite rather than being a pass-through.
const LONDON = 'Europe/London'
const AUCKLAND = 'Pacific/Auckland'

describe('slotToDayFormClocks', () => {
  it('seeds a range for a drag so the dragged duration survives', () => {
    // 10:00 to 11:00 London wall time on a June day (UTC+1).
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T10:00:00.000Z')
    expect(slotToDayFormClocks(start, end, 'select', LONDON)).toEqual({ startClock: '10:00', endClock: '11:00' })
  })

  it('seeds only the start for a click, inventing no duration', () => {
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T09:15:00.000Z')
    expect(slotToDayFormClocks(start, end, 'click', LONDON)).toEqual({ startClock: '10:00', endClock: null })
  })

  it('renders the clock in the tour zone, not UTC', () => {
    // 21:00Z is 09:00 the next morning in Auckland.
    const start = new Date('2030-06-14T21:00:00.000Z')
    const end = new Date('2030-06-14T22:30:00.000Z')
    expect(slotToDayFormClocks(start, end, 'select', AUCKLAND)).toEqual({ startClock: '09:00', endClock: '10:30' })
  })

  it('snaps both ends to the quarter hour', () => {
    const start = new Date('2030-06-14T09:04:00.000Z') // -> 10:00 London
    const end = new Date('2030-06-14T09:56:00.000Z') // -> 11:00 London
    expect(slotToDayFormClocks(start, end, 'select', LONDON)).toEqual({ startClock: '10:00', endClock: '11:00' })
  })

  it('drops a drag too small to span a slot back to a bare start', () => {
    // A few minutes' drag that snaps to the same quarter hour is a click, not a
    // zero-length range.
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T09:05:00.000Z')
    expect(slotToDayFormClocks(start, end, 'select', LONDON)).toEqual({ startClock: '10:00', endClock: null })
  })
})
