import { describe, it, expect } from 'vitest'
import { slotToDayFormInput, to12HourClock } from '@/lib/schedule/day-form-prefill'

// These pin REE-69: a drag on the empty grid has to seed the day form with the
// range it spanned, or the duration is lost and the item saves at the kind's
// synthesised end (the "60 mins dragged, 30 min block saved" bug). A click still
// seeds only the start. The clocks are wall time in the tour's zone, stated with
// a meridiem so parseDayItem reads them back exactly.
//
// London in June is UTC+1, Auckland is UTC+12, which is what makes the zone
// argument bite rather than being a pass-through.
const LONDON = 'Europe/London'
const AUCKLAND = 'Pacific/Auckland'

describe('to12HourClock', () => {
  it('states a meridiem so a morning hour is not re-guessed as pm', () => {
    expect(to12HourClock('07:30')).toBe('7:30am')
    expect(to12HourClock('19:30')).toBe('7:30pm')
    expect(to12HourClock('00:00')).toBe('12:00am')
    expect(to12HourClock('12:00')).toBe('12:00pm')
  })
})

describe('slotToDayFormInput', () => {
  it('seeds a range for a drag so the dragged duration survives', () => {
    // 10:00 to 11:00 London wall time on a June day (UTC+1).
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T10:00:00.000Z')
    expect(slotToDayFormInput(start, end, 'select', LONDON)).toBe('10:00am–11:00am')
  })

  it('seeds only the start for a click, inventing no duration', () => {
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T09:15:00.000Z')
    expect(slotToDayFormInput(start, end, 'click', LONDON)).toBe('10:00am')
  })

  it('renders the clock in the tour zone, not UTC', () => {
    // 21:00Z is 09:00 the next morning in Auckland.
    const start = new Date('2030-06-14T21:00:00.000Z')
    const end = new Date('2030-06-14T22:30:00.000Z')
    expect(slotToDayFormInput(start, end, 'select', AUCKLAND)).toBe('9:00am–10:30am')
  })

  it('snaps both ends to the quarter hour', () => {
    const start = new Date('2030-06-14T09:04:00.000Z') // -> 10:00 London
    const end = new Date('2030-06-14T09:56:00.000Z') // -> 11:00 London
    expect(slotToDayFormInput(start, end, 'select', LONDON)).toBe('10:00am–11:00am')
  })

  it('drops a drag too small to span a slot back to a bare start', () => {
    // A few minutes' drag that snaps to the same quarter hour is a click, not a
    // zero-length range.
    const start = new Date('2030-06-14T09:00:00.000Z')
    const end = new Date('2030-06-14T09:05:00.000Z')
    expect(slotToDayFormInput(start, end, 'select', LONDON)).toBe('10:00am')
  })
})
