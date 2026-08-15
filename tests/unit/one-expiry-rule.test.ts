import { describe, it, expect } from 'vitest'
import { expiryStatus, formatExpiry } from '@/lib/roster/expiry'

// This is the shared rule the Roster and a tour's People page now agree on.
// Before this file, people-table.tsx carried its own private copy with no
// 'none' state and `days < 90` instead of `days <= 90`, so a document exactly
// 90 days out read as fine on one page and due for renewal on the other.

function daysFromToday(days: number): string {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

describe('expiryStatus', () => {
  it('is none when there is no expiry date', () => {
    expect(expiryStatus(null)).toBe('none')
  })

  it('is soon at exactly 90 days out', () => {
    expect(expiryStatus(daysFromToday(90))).toBe('soon')
  })

  it('is ok at 91 days out', () => {
    expect(expiryStatus(daysFromToday(91))).toBe('ok')
  })

  it('is expired for a date in the past', () => {
    expect(expiryStatus(daysFromToday(-1))).toBe('expired')
  })
})

describe('formatExpiry', () => {
  it('includes the day of the month', () => {
    const formatted = formatExpiry('2030-06-15')
    expect(formatted).toContain('15')
  })
})
