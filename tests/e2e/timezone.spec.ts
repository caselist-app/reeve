import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// The browser-level regression for the whole timezone gamble (Brief 43).
//
// The calendar renders react-big-calendar through a prototype-patched luxon
// localizer (lib/schedule/calendar-localizer.ts), because RBC has no supported
// way to render a single calendar in a named IANA zone and the community fix has
// sat as an unmerged PR since 2022. tests/unit/calendar-zone.test.ts pins the
// localizer's own methods; this pins the thing that actually reaches a TM: an
// Auckland day, opened from a London browser, drawn in Auckland time.
//
// The browser context is Europe/London so the calendar cannot pass by rendering
// in the browser's own zone. Playwright sets the zone per context, which is why
// this is cheap: no second machine, no CI zone juggling.
test.use({ timezoneId: 'Europe/London' })

test('an Auckland day is drawn in Auckland time from a London browser', async ({ page }) => {
  const seed = readSeed()
  const { zoned } = seed.a

  await page.goto(`/tours/${zoned.tourId}/schedule?date=${zoned.date}`)

  // The seeded load-in is 09:00 Auckland (21:00Z the day before). Its block
  // renders on the grid; the chip's own time label is derived from the tour zone
  // (localTimeInZone in day-calendar.tsx), so it reads 09:00 and not the London
  // wall clock of the same instant, which is 10:00 PM.
  //
  // .first() because RBC briefly double-mounts an event node on first paint,
  // before its own gutter-measure re-render settles the grid to one. A bare
  // .rbc-event filter throws a strict-mode violation on that transient instead of
  // waiting it out. revalidate.spec.ts locates the same Load-in block the same
  // way for the same reason; this spec only avoided it because the 30-minute step
  // it was written against did not line the transient up with the first query.
  const block = page.locator('.rbc-event', { hasText: 'Load-in' }).first()
  await expect(block).toBeVisible()
  await expect(block).toContainText('09:00')

  // The gutter reads the broadcast day (REE-114): the grid runs [04:00, +1 04:00)
  // in the tour zone, so its topmost label is the 04:00 broadcast start in
  // Auckland, not calendar midnight. The label is un-shifted back to its real
  // instant and formatted in the tour zone (timeGutterFormat in day-calendar.tsx),
  // so a zone regression that drew it in the London browser's zone would not read
  // "04:00" here.
  const topGutterLabel = page.locator('.rbc-time-gutter .rbc-label').first()
  await expect(topGutterLabel).toHaveText(/04:00/)

  // Placement check. The block sits in synthetic grid space: 09:00 Auckland is
  // five hours past the 04:00 broadcast start, so it lands at 5/24 = 20.8% down
  // the grid, under the "04:00" the gutter labels above it. RBC positions by
  // elapsed minutes from the grid's start (see getSlotMetrics/positionFromDate),
  // which is zone-independent, so position and the Auckland-time gutter agree; the
  // DST-day case where position itself becomes zone-sensitive is pinned in
  // calendar-zone.test.ts.
  const topPercent = await block.evaluate((el) => parseFloat((el as HTMLElement).style.top))
  expect(topPercent).toBeGreaterThan(15)
  expect(topPercent).toBeLessThan(27)
})

// The DST regression for the broadcast grid (REE-116). The grid shifts a real
// instant back four hours of WALL CLOCK, not a fixed elapsed offset, so a block
// on a spring-forward or fall-back day lands on its gutter label instead of an
// hour off it. This opens a Europe/London show on 2026-03-29, the day the clocks
// jump 01:00 -> 02:00: the broadcast window is a clean 24 wall hours while the
// calendar day RBC draws is only 23, which is exactly where the retired
// fixed-offset shift went wrong.
//
// The browser context is still Europe/London (test.use above), and so is the
// tour, because this pins the shift, not the browser-vs-tour zone independence
// that the Auckland test above pins. Running it end to end in a real browser is
// what makes it a regression guard rather than a restatement of the unit maths in
// calendar-zone.test.ts.
test('a spring-forward day places a block on its broadcast label, not an hour off', async ({
  page,
}) => {
  const seed = readSeed()
  const { zonedDst } = seed.a

  await page.goto(`/tours/${zonedDst.tourId}/schedule?date=${zonedDst.date}`)

  // The seeded load-in is 09:00 London on the transition day. Its chip label is
  // the tour-zone wall clock of the real instant, so it reads 09:00 whatever the
  // shift does; the position is the part the shift decides. .first() for the same
  // first-paint double-mount reason as the test above.
  const block = page.locator('.rbc-event', { hasText: 'Load-in' }).first()
  await expect(block).toBeVisible()
  await expect(block).toContainText('09:00')

  // The gutter still opens at the 04:00 broadcast start, un-shifted back to its
  // real instant and formatted in the tour zone.
  const topGutterLabel = page.locator('.rbc-time-gutter .rbc-label').first()
  await expect(topGutterLabel).toHaveText(/04:00/)

  // The discriminating assertion. 09:00 is five hours past the 04:00 broadcast
  // start, so the block sits at 5/24 = 20.8% down the grid. The retired
  // fixed-offset shift subtracted only the three real hours between the view
  // date's 00:00 and 04:00 (the spring-forward gap eats one), which lands the same
  // block at 6/24 = 25%. The window below passes the wall-clock shift and fails
  // the elapsed one.
  const topPercent = await block.evaluate((el) => parseFloat((el as HTMLElement).style.top))
  expect(topPercent).toBeGreaterThan(18)
  expect(topPercent).toBeLessThan(23)
})
