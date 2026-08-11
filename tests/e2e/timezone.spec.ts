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
