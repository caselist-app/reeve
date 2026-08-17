import { describe, it, expect } from 'vitest'
import { parseFlightDate } from '@/lib/utils/parse-flight-date'

// Every test passes an explicit `now`, so this suite never touches the real
// system clock and cannot flake with the date.

// 2026-08-03 is a Monday (verified with `new Date(2026, 7, 3).getDay()`).
const MONDAY = new Date(2026, 7, 3, 10, 0, 0)

describe('parseFlightDate: relative words', () => {
  it('parses "today"', () => {
    const result = parseFlightDate('today', MONDAY)
    expect(result?.date).toBe('2026-08-03')
  })

  it('parses "tomorrow"', () => {
    const result = parseFlightDate('tomorrow', MONDAY)
    expect(result?.date).toBe('2026-08-04')
  })
})

describe('parseFlightDate: ISO input', () => {
  it('parses an ISO date', () => {
    const result = parseFlightDate('2026-08-03', MONDAY)
    expect(result?.date).toBe('2026-08-03')
  })
})

describe('parseFlightDate: weekday names', () => {
  it('parses a bare weekday name as the next occurrence, today included', () => {
    // "monday" on a Monday returns today: nextWeekday allows today, and
    // there is no "next" prefix to force the roll-forward special case.
    const result = parseFlightDate('monday', MONDAY)
    expect(result?.date).toBe('2026-08-03')
  })

  it('parses an abbreviated weekday name the same way', () => {
    const result = parseFlightDate('mon', MONDAY)
    expect(result?.date).toBe('2026-08-03')
  })

  it('"next monday" on a Monday rolls a full week forward, not today', () => {
    // The comment in the source is explicit: "next monday" always means the
    // coming one, not today even if today matches.
    const result = parseFlightDate('next monday', MONDAY)
    expect(result?.date).toBe('2026-08-10')
  })
})

describe('parseFlightDate: day-month input', () => {
  // A fixed "now" comfortably before August, so none of these need to
  // reason about year rollover as well.
  const JANUARY = new Date(2026, 0, 15)

  it('parses "3 aug"', () => {
    const result = parseFlightDate('3 aug', JANUARY)
    expect(result?.date).toBe('2026-08-03')
  })

  it('parses "3rd august" with an ordinal suffix', () => {
    const result = parseFlightDate('3rd august', JANUARY)
    expect(result?.date).toBe('2026-08-03')
  })

  it('parses the month-day order "aug 3" to the same date as "3 aug"', () => {
    const dayFirst = parseFlightDate('3 aug', JANUARY)
    const monthFirst = parseFlightDate('aug 3', JANUARY)
    expect(monthFirst?.date).toBe(dayFirst?.date)
    expect(monthFirst?.date).toBe('2026-08-03')
  })
})

describe('parseFlightDate: numeric input, UK day-before-month', () => {
  const JANUARY = new Date(2026, 0, 15)

  it('parses "3/8" as 3 August, not March 8th', () => {
    const result = parseFlightDate('3/8', JANUARY)
    expect(result?.date).toBe('2026-08-03')
  })
})

describe('parseFlightDate: year rollover', () => {
  // "now" is in December, so a day-month or numeric date earlier in the
  // year has already passed and must roll to next year rather than return a
  // date in the past.
  const DECEMBER = new Date(2026, 11, 15)

  it('rolls a day-month date that has already passed this year to next year', () => {
    const result = parseFlightDate('3 aug', DECEMBER)
    expect(result?.date).toBe('2027-08-03')
  })

  it('rolls a numeric date that has already passed this year to next year', () => {
    const result = parseFlightDate('3/8', DECEMBER)
    expect(result?.date).toBe('2027-08-03')
  })
})

describe('parseFlightDate: malformed input', () => {
  const NOW = new Date(2026, 0, 15)

  it('returns null for an empty string', () => {
    expect(parseFlightDate('', NOW)).toBeNull()
  })

  it('returns null for unrecognised free text', () => {
    expect(parseFlightDate('not a date', NOW)).toBeNull()
  })

  it('returns null for an out-of-range numeric date', () => {
    expect(parseFlightDate('32/13', NOW)).toBeNull()
  })
})

describe('parseFlightDate: label', () => {
  it('formats the label as weekday-short, day-numeric, month-short (en-GB)', () => {
    const result = parseFlightDate('2026-08-03', MONDAY)
    // Verified against this Node runtime's ICU output rather than guessed.
    expect(result?.label).toBe('Mon 3 Aug')
  })
})
