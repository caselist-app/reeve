import { describe, it, expect } from 'vitest'
import { expiryStatus, formatExpiry } from '@/lib/roster/expiry'

// Both functions under test read the real system clock (new Date()), so
// every fixture here is computed relative to "today" rather than hardcoded,
// or this test would start failing the day after it was written.
//
// Built from local date parts rather than toISOString(), which reads UTC
// and can land on a different calendar day than the local setDate() above
// near a UTC/local boundary depending on the runner's TZ. vitest.config.mts
// runs the unit suite with no fixed TZ (only the calendar/e2e jobs pin
// TZ=Europe/London), so this has to be timezone-safe on its own.
function daysFromToday(n: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

describe('expiryStatus', () => {
  it('returns none for a null expiry', () => {
    expect(expiryStatus(null)).toBe('none')
  })

  it('returns expired for a date exactly yesterday', () => {
    expect(expiryStatus(daysFromToday(-1))).toBe('expired')
  })

  it('does not treat today as expired: days = 0 falls through to soon', () => {
    // `days < 0` is false at days = 0, so today lands in the `days <= 90`
    // branch rather than `expired`. Pin the actual boundary rather than
    // assuming it.
    expect(expiryStatus(daysFromToday(0))).toBe('soon')
  })

  it('returns soon at the 90-day boundary (<=)', () => {
    expect(expiryStatus(daysFromToday(90))).toBe('soon')
  })

  it('returns ok just past the 90-day boundary', () => {
    expect(expiryStatus(daysFromToday(91))).toBe('ok')
  })
})

describe('formatExpiry', () => {
  it('returns a dash for a null expiry', () => {
    expect(formatExpiry(null)).toBe('-')
  })

  it('formats a known date as day month year, en-GB', () => {
    expect(formatExpiry('2026-03-05')).toBe('5 Mar 2026')
  })
})
