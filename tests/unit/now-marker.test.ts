import { describe, it, expect } from 'vitest'
import { nowMarker } from '@/lib/schedule/now-marker'

// Pure, so a unit test: runs with `pnpm test`, no Docker. Every expectation is
// a wall-clock fact about a real timezone, not a restatement of the maths.
//
// Auckland is UTC+12 in June (southern winter, no DST), so 21:00Z on 14 June is
// 09:00 on 15 June there: one instant that is a different date in UTC and the
// same date in the tour zone, which is exactly the case a UTC-day derivation
// gets wrong. London is UTC+1 in June, so it catches a label formatted in UTC
// because an offset of zero cannot pass by luck.

describe('nowMarker', () => {
  // 21:00Z on 14 June reads as 09:00 on 15 June in Auckland. 09:00 is 9/24 of
  // the day, so the label sits 37.5% down the gutter.
  const AUCKLAND_9AM = '2026-06-14T21:00:00.000Z'

  it('positions and labels the marker on the viewed day', () => {
    expect(nowMarker(AUCKLAND_9AM, 'Pacific/Auckland', '2026-06-15')).toEqual({
      topPercent: 37.5,
      label: '09:00',
    })
  })

  it('returns null when now is not the viewed day', () => {
    // Same instant, but the grid is showing the day before, so there is no
    // marker to draw.
    expect(nowMarker(AUCKLAND_9AM, 'Pacific/Auckland', '2026-06-14')).toBeNull()
  })

  it('marks the tour-local day even when UTC is a day off', () => {
    // The instant is 14 June in UTC and 15 June in Auckland. A UTC-midnight
    // derivation would put it on the 14th and return null here; the tour-local
    // day keeps it on the 15th.
    expect(nowMarker(AUCKLAND_9AM, 'Pacific/Auckland', '2026-06-15')).not.toBeNull()
  })

  it('formats the label in the tour zone, not UTC', () => {
    // 08:00Z reads as 09:00 in London in June (UTC+1). A label built off UTC
    // would say 08:00.
    expect(nowMarker('2026-06-15T08:00:00.000Z', 'Europe/London', '2026-06-15')?.label).toBe(
      '09:00',
    )
  })
})
