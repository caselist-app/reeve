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
  const block = page.locator('.rbc-event', { hasText: 'Load-in' })
  await expect(block).toBeVisible()
  await expect(block).toContainText('09:00')

  // The hour gutter is where RBC's own zoned rendering shows. Its topmost label
  // is midnight in the tour zone (12:00 AM Auckland). If the localizer had fallen
  // back to the browser's zone, the top of an Auckland-midnight-bounded grid
  // would read 1:00 PM (Auckland midnight is 13:00 in London in June), so this is
  // the assertion that fails on a zone regression. The matcher is tolerant of the
  // 12/24-hour split because the label format follows the browser locale.
  const topGutterLabel = page.locator('.rbc-time-gutter .rbc-label').first()
  await expect(topGutterLabel).toHaveText(/12:00\s?AM|12\s?AM|00:00/i)

  // Placement check, not a second zone proof. On a day with no DST change RBC
  // positions a block by elapsed minutes from the grid's start (see
  // getSlotMetrics/positionFromDate), which is zone-independent, so 09:00 sits at
  // 9/24 = 37.5% down the grid whatever the localizer's zone. Asserting it
  // confirms the block landed at the 09:00 row that the gutter above labels in
  // Auckland time, so position and label agree; the DST-day case where position
  // itself becomes zone-sensitive is pinned in calendar-zone.test.ts.
  const topPercent = await block.evaluate((el) => parseFloat((el as HTMLElement).style.top))
  expect(topPercent).toBeGreaterThan(30)
  expect(topPercent).toBeLessThan(45)
})
