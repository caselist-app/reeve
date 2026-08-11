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
//
// BROADCAST DAY (REE-114): the grid renders [04:00, +1 04:00) shifted onto one
// calendar day, so the marker is POSITIONED in that shifted space while it is
// still LABELLED with the real wall clock. A real 09:00 sits five hours into the
// broadcast day (04:00 is grid midnight), so it is 5/24 down the gutter, not
// 9/24, and a real 01:00 belongs to the previous night's grid near its bottom.

describe('nowMarker', () => {
  // 21:00Z on 14 June reads as 09:00 on 15 June in Auckland. On the broadcast
  // grid, 09:00 is five hours past the 04:00 start, so the label sits 5/24 of
  // the way down: 20.833%. The label is still the real 09:00.
  const AUCKLAND_9AM = '2026-06-14T21:00:00.000Z'

  it('positions in broadcast space and labels with the real wall clock', () => {
    expect(nowMarker(AUCKLAND_9AM, 'Pacific/Auckland', '2026-06-15')).toEqual({
      topPercent: (5 / 24) * 100,
      label: '09:00',
    })
  })

  it('returns null when now is not the viewed broadcast day', () => {
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

  it('keeps a past-midnight now on the night it belongs to', () => {
    // 01:00 in Auckland on 15 June (13:00Z on the 14th) is the small hours of the
    // 14th's broadcast night, which runs to 04:00 on the 15th. It marks the 14th,
    // near the bottom (01:00 is 21 hours past the 04:00 start), and reads "01:00".
    const marker = nowMarker('2026-06-14T13:00:00.000Z', 'Pacific/Auckland', '2026-06-14')
    expect(marker).toEqual({ topPercent: (21 / 24) * 100, label: '01:00' })
    // And it is NOT on the 15th, whose broadcast day has not started at 01:00.
    expect(nowMarker('2026-06-14T13:00:00.000Z', 'Pacific/Auckland', '2026-06-15')).toBeNull()
  })

  it('formats the label in the tour zone, not UTC', () => {
    // 08:00Z reads as 09:00 in London in June (UTC+1). A label built off UTC
    // would say 08:00.
    expect(nowMarker('2026-06-15T08:00:00.000Z', 'Europe/London', '2026-06-15')?.label).toBe(
      '09:00',
    )
  })
})
