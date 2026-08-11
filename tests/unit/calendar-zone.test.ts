import { describe, it, expect } from 'vitest'
import { createZonedLocalizer } from '@/lib/schedule/calendar-localizer'
import { toGridInstant } from '@/lib/schedule/day-window'
import { localDayWindowUtc, wallClockToUtc } from '@/lib/schedule/datetime'

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

// The three tests above all go through `format`, which is the hour gutter down
// the side of the calendar. Brief 43 asked for three things to agree, and the
// other two are where a block sits vertically and what instant you get when you
// drag it. Those run through different localizer methods, so a zone patch that
// covered only `format` would pass everything above and still stack every block
// at the browser's offset.
//
// These are the methods react-big-calendar's TimeSlots actually calls to place
// a block (see getSlotMetrics: getTotalMin, getMinutesFromMidnight, getSlotDate,
// getDstOffset). Asserting on them directly is the closest the unit layer gets
// to asserting on pixels, and it is what stops a later "simplification" of the
// localizer from silently breaking layout while the gutter still reads right.
describe('createZonedLocalizer: the block positioning path', () => {
  const auckland = createZonedLocalizer('Pacific/Auckland')

  // Vertical position is a fraction of the day, so it is minutes-from-midnight
  // that decides it. 22:00Z on 14 June is 10:00 on the 15th in Auckland, which
  // is 600 minutes down a day starting at midnight. Under the browser's London
  // zone it would be 23:00 and 1380, near the bottom of the wrong day.
  it('measures minutes from midnight in the tour zone', () => {
    expect(auckland.getMinutesFromMidnight(JUNE_EVENING_UTC)).toBe(600)
  })

  // The top of the column. Auckland midnight on 15 June is 12:00Z on the 14th.
  it('starts the day at the tour zone midnight', () => {
    expect(auckland.startOf(JUNE_EVENING_UTC, 'day').toISOString()).toBe('2026-06-14T12:00:00.000Z')
  })

  // The drag result. Dropping a block 600 minutes down the column has to produce
  // the instant that 10:00 Auckland actually is, because that instant is what
  // gets written to the row.
  it('turns a slot position back into the right instant', () => {
    const aucklandMidnight = new Date('2026-06-14T12:00:00.000Z')
    expect(auckland.getSlotDate(aucklandMidnight, 0, 600).toISOString()).toBe(
      '2026-06-14T22:00:00.000Z'
    )
  })

  // A spring-forward day is 23 real hours but still has to be drawn as a 24 hour
  // grid, or every block below 01:00 sits an hour high. RBC handles that by
  // adding getDstOffset back onto the elapsed minutes, so both halves have to be
  // right: 1380 real minutes, 60 minutes of correction.
  it('keeps a DST day a full grid', () => {
    const london = createZonedLocalizer('Europe/London')
    const dayStart = new Date('2026-03-29T00:00:00.000Z')
    const dayEnd = new Date('2026-03-29T23:00:00.000Z')

    expect(london.getTotalMin(dayStart, dayEnd)).toBe(1380)
    expect(london.getDstOffset(dayStart, dayEnd)).toBe(60)
  })

  // The two below are the reason createZonedLocalizer overrides getDstOffset at
  // all. luxonLocalizer does not provide one, so RBC falls back to a raw JS Date
  // implementation that reads the browser's zone. Patching DateTime cannot reach
  // it. Both of these failed before that override existed, in opposite
  // directions, and neither is visible from a machine sitting in the tour's own
  // zone: that is what makes it worth pinning down here rather than in a browser.

  // London springs forward on 29 March 2026. Auckland does not: its own change
  // is a week later. So an Auckland calendar must report no correction that day,
  // no matter what the machine underneath it is doing.
  it('ignores a DST change that belongs to the browser, not the tour', () => {
    const aucklandMidnight = new Date('2026-03-28T11:00:00.000Z')
    const aucklandAfternoon = new Date('2026-03-29T02:00:00.000Z')

    expect(auckland.getDstOffset(aucklandMidnight, aucklandAfternoon)).toBe(0)
  })

  // And the mirror: Auckland's own change, on 5 April 2026, has to register even
  // though no browser outside New Zealand notices anything that day.
  it('applies a DST change that belongs to the tour, not the browser', () => {
    const aucklandMidnight = new Date('2026-04-04T11:00:00.000Z')
    const aucklandEvening = new Date('2026-04-04T20:00:00.000Z')

    expect(auckland.getDstOffset(aucklandMidnight, aucklandEvening)).toBe(-60)
  })
})

// The block-positioning path above proves the localizer places an instant at the
// right position, DST correction and all. The broadcast grid (REE-114) sits one
// step earlier: it shifts a real instant back four hours with toGridInstant
// before RBC ever sees it. REE-116 makes that a wall-clock shift so the two agree
// on a transition day, where a fixed four-hour elapsed shift left every block
// past the change an hour off its label.
//
// These compose the two: toGridInstant, then RBC's own positionFromDate, which is
// literally what sets a block's `top` (react-big-calendar/lib/utils/TimeSlots.js):
// diff from the grid's start plus the localizer's getDstOffset correction. It is
// spelled out here rather than via getMinutesFromMidnight on purpose. RBC's
// default getMinutesFromMidnight reads a module-scoped getDstOffset, not the
// instance override this file pins, so it would bypass the very correction under
// test; positionFromDate reads localizer.getDstOffset, the override. The expected
// value is the broadcast wall clock minus four hours, in minutes: a 21:00 show
// sits at 17:00 = 1020, whatever the offset did earlier that day. The retired
// fixed-offset shift returns 1080 (spring) or 960 (fall-back) here.
//
// Europe/London is both the tour zone and the pinned unit-job TZ, so these read
// the same on a UTC runner: toGridInstant and getDstOffset are both explicit-zone.
// The override-removal regression is caught by the Auckland tests above, not
// these; what these add is the broadcast shift being wall-clock, not elapsed.
describe('createZonedLocalizer: positioning a broadcast block across a DST transition', () => {
  const london = createZonedLocalizer('Europe/London')

  // RBC's positionFromDate, using the instance override, against the grid's own
  // 00:00 (the calendar's `min` for the viewed day).
  function gridPositionMinutes(realWall: string, viewedDate: string): number {
    const gridStart = new Date(localDayWindowUtc(viewedDate, 'Europe/London').start)
    const gridInstant = new Date(
      toGridInstant(wallClockToUtc(realWall, 'Europe/London'), 'Europe/London'),
    )
    return london.diff(gridStart, gridInstant, 'minutes') + london.getDstOffset(gridStart, gridInstant)
  }

  // 2026-03-29, London springs forward 01:00 -> 02:00. Viewed as its own day, the
  // broadcast window [04:00, +1 04:00) is past the change and clean, so a 21:00
  // show is a straight 17:00 on the grid: 1020 minutes down a column the
  // getDstOffset correction still draws as a full 24 hours.
  it('places a 21:00 show at 17:00 (1020 min) on the spring-forward day', () => {
    expect(gridPositionMinutes('2026-03-29T21:00', '2026-03-29')).toBe(1020)
  })

  // The mirror on 2026-10-25, fall back 02:00 -> 01:00. Same 1020, reached with a
  // negative correction instead of a positive one.
  it('places a 21:00 show at 17:00 (1020 min) on the fall-back day', () => {
    expect(gridPositionMinutes('2026-10-25T21:00', '2026-10-25')).toBe(1020)
  })

  // Viewing 2026-03-28, whose broadcast night runs into the 29th and so contains
  // the spring-forward change (a 23-hour night). A 02:30 curfew on the 29th is
  // broadcast-wall 26:30, i.e. grid 22:30 = 1350 minutes. The fixed-offset shift
  // read this an hour early, at 21:30.
  it('places a next-morning curfew at 22:30 (1350 min) when the change is in the tail', () => {
    expect(gridPositionMinutes('2026-03-29T02:30', '2026-03-28')).toBe(1350)
  })
})
