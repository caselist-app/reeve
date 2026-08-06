import { describe, it, expect } from 'vitest'
import { createZonedLocalizer } from '@/lib/schedule/calendar-localizer'

// The spike for Brief 43, kept as a regression test rather than thrown away.
// It proves the one thing that gated the whole calendar project: that a
// react-big-calendar localizer can render a single calendar in a named IANA
// zone reliably, without the process-wide `Settings.defaultZone` mutation that
// would leak one tour's timezone into another on Vercel's shared Node process.
//
// The localizer's `format` is the same code path the calendar uses for its hour
// gutter labels and, through fromJSDate, for block positions and drag results.
// So asserting on `format` here asserts on what a browser would actually render.
// Every expectation is a wall-clock fact about a real zone, not a restatement of
// the implementation. `HH:mm` (24-hour) is used rather than the locale `t` token
// so the assertions do not depend on the machine's locale.

// UTC instant used across the first assertion. 22:00Z on 14 June is already the
// 15th in Auckland (UTC+12, southern winter, no DST) and still the 14th in
// London (UTC+1, BST). One zone crosses the date line relative to UTC, the other
// does not: exactly the disagreement the calendar has to get right.
const JUNE_EVENING_UTC = new Date('2026-06-14T22:00:00.000Z')

describe('createZonedLocalizer', () => {
  it('renders a known UTC instant at the right wall clock in each zone', () => {
    const auckland = createZonedLocalizer('Pacific/Auckland')
    const london = createZonedLocalizer('Europe/London')

    expect(auckland.format(JUNE_EVENING_UTC, 'yyyy-MM-dd HH:mm', 'en')).toBe('2026-06-15 10:00')
    expect(london.format(JUNE_EVENING_UTC, 'yyyy-MM-dd HH:mm', 'en')).toBe('2026-06-14 23:00')
  })

  // A fixed-offset implementation passes June and fails here: the same zone must
  // report a different offset on each side of its DST transition. Europe/London
  // is the catch, changing offset twice a year; Auckland stays put through both
  // of these instants, which is the control.
  it('tracks DST, not a frozen offset', () => {
    const london = createZonedLocalizer('Europe/London')
    const auckland = createZonedLocalizer('Pacific/Auckland')

    // Late March: BST begins at 01:00Z on 2026-03-29. GMT (UTC+0) before it,
    // BST (UTC+1) after. The clock jumps from 00:30 to 03:00 across the gap.
    const beforeSpringForward = new Date('2026-03-29T00:30:00.000Z')
    const afterSpringForward = new Date('2026-03-29T02:00:00.000Z')
    expect(london.format(beforeSpringForward, 'HH:mm', 'en')).toBe('00:30')
    expect(london.format(afterSpringForward, 'HH:mm', 'en')).toBe('03:00')

    // Late October: BST ends at 01:00Z on 2026-10-25. BST (UTC+1) before it,
    // GMT (UTC+0) after.
    const beforeFallBack = new Date('2026-10-25T00:30:00.000Z')
    const afterFallBack = new Date('2026-10-25T02:00:00.000Z')
    expect(london.format(beforeFallBack, 'HH:mm', 'en')).toBe('01:30')
    expect(london.format(afterFallBack, 'HH:mm', 'en')).toBe('02:00')

    // Auckland holds UTC+13 through both instants (its DST spans Sep to Apr), so
    // both London boundaries land at the same Auckland wall clock. This is what
    // makes the London movement above a property of the zone, not of the clock.
    expect(auckland.format(beforeSpringForward, 'HH:mm', 'en')).toBe('13:30')
    expect(auckland.format(beforeFallBack, 'HH:mm', 'en')).toBe('13:30')
  })

  // The assertion that fails the instant someone reaches for `Settings.defaultZone`.
  // Two localizers, two zones, one process: building the second must not change
  // what the first renders. A global mutation would make the last one constructed
  // win for both.
  it('keeps two zones independent in the same process', () => {
    const london = createZonedLocalizer('Europe/London')
    expect(london.format(JUNE_EVENING_UTC, 'HH:mm', 'en')).toBe('23:00')

    // Construct a second localizer for a very different zone.
    const auckland = createZonedLocalizer('Pacific/Auckland')
    expect(auckland.format(JUNE_EVENING_UTC, 'HH:mm', 'en')).toBe('10:00')

    // The first localizer must be exactly as correct as it was before the
    // second existed.
    expect(london.format(JUNE_EVENING_UTC, 'HH:mm', 'en')).toBe('23:00')
  })
})
