import { describe, it, expect } from 'vitest'
import { gridInstantLabel, gridRangeLabel } from '@/lib/schedule/grid-time-label'
import { toGridInstant } from '@/lib/schedule/day-window'
import { wallClockToUtc } from '@/lib/schedule/datetime'

// REE-288: react-big-calendar's default `eventTimeRangeFormat` formats through
// the luxon localizer's unpinned `t` token, which reads the ambient Intl locale
// of whichever environment renders it. Node's default locale on the server can
// disagree with the browser's on the client (12h "7:30 AM" vs 24h "07:30"),
// which surfaces as a hydration mismatch on the event block's native `title`
// attribute rather than just a display slip. These formatters use
// `localTimeInZone`'s fixed `sv-SE` locale instead, so the output cannot vary
// by environment: asserting the exact `HH:MM` string is the whole point, not
// an incidental detail.

function gridInstant(realWall: string, timezone: string): Date {
  return new Date(toGridInstant(wallClockToUtc(realWall, timezone), timezone))
}

describe('gridInstantLabel', () => {
  it('reports the real wall clock a grid-space instant stands for, regardless of locale', () => {
    // Broadcast day shifts real 07:30 back by DAY_START_HOUR (4h) to grid 03:30.
    const instant = gridInstant('2026-06-15T07:30', 'Europe/London')
    expect(gridInstantLabel(instant, 'Europe/London')).toBe('07:30')
  })

  it('is not tied to the calendar\'s own timezone', () => {
    const instant = gridInstant('2026-06-15T21:00', 'Pacific/Auckland')
    expect(gridInstantLabel(instant, 'Pacific/Auckland')).toBe('21:00')
  })
})

describe('gridRangeLabel', () => {
  it('formats a start-end range in fixed 24-hour notation', () => {
    const start = gridInstant('2026-06-15T07:30', 'Europe/London')
    const end = gridInstant('2026-06-15T08:00', 'Europe/London')
    expect(gridRangeLabel(start, end, 'Europe/London')).toBe('07:30 – 08:00')
  })
})
