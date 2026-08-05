import { expect, test } from '@playwright/test'
import { E2E_SEEDED_LOAD_IN_LOCAL } from '../integration/fixture'
import { readSeed } from './seed'

// The edit-then-look-somewhere-else class. This has shipped three separate
// times: updateTourAction, updateDaySheet, and the Dates sidebar. Every one of
// them saved correctly, said "Saved.", and showed the TM the old value.
//
// Nothing else in the repo can catch it. check:conventions Rule 2 greps for a
// revalidatePath call on actions writing schedule-rendered tables, which cannot
// tell whether the path is right, and the integration suite mocks next/cache to
// a vi.fn(), so revalidate is invisible there by design.
//
// Each spec restores what it changed, or changes something no other spec reads.
// workers: 1 makes these sequential, not independent.

test('an edited load-in shows on the timeline without a reload', async ({ page }) => {
  const seed = readSeed()
  const newTime = '17:30'

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  // The timeline card itself, not the bare time. Each card renders its time
  // twice (a desktop column and a mobile inline copy), so matching on "16:00"
  // alone hits six elements and fails on strict mode. The card is a button
  // whose accessible name carries the label, which is a stable handle.
  const loadInCard = page.getByRole('button', { name: /Load-in/ }).first()

  // The seeded value, so the assertion below cannot pass on a page that never
  // showed a load-in at all.
  await expect(loadInCard).toContainText(E2E_SEEDED_LOAD_IN_LOCAL)

  await loadInCard.click()

  // The panel's heading is the venue name; "Day sheet" is its description.
  await expect(page.getByText('Day sheet')).toBeVisible()

  // By form field name rather than by label. The panel's time labels carry no
  // htmlFor and the input no id, so nothing associates them and getByLabel
  // cannot see them. The field name is the contract the server action reads, so
  // it is a more stable handle than either the label text or the DOM shape.
  // Worth fixing in the app for screen readers, but not in this brief.
  const loadIn = page.locator('input[name="load_in"]')

  await loadIn.fill(newTime)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // No reload anywhere in this test. If the action stops revalidating the
  // schedule route, the panel still says "Saved." and this line goes red.
  await expect(page.getByRole('button', { name: /Load-in/ }).first()).toContainText(newTime)

  // Restore, so nothing downstream reads a time this spec invented.
  await loadIn.fill(E2E_SEEDED_LOAD_IN_LOCAL)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /Load-in/ }).first()).toContainText(
    E2E_SEEDED_LOAD_IN_LOCAL
  )
})

test('a new day appears in the Dates sidebar without a reload', async ({ page }) => {
  const seed = readSeed()

  // A date the tour does not have, and one no other spec looks at.
  const newDate = addDays(seed.a.date, 10)

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(0)

  await page.getByRole('button', { name: 'Add day' }).click()
  await page.getByRole('button', { name: /Day off/ }).click()

  // Scoped to the form holding the Date field: the sidebar's trigger and the
  // panel's submit button have the same accessible name, and `form` is a
  // semantic element rather than a styling hook.
  const panel = page.locator('form').filter({ has: page.getByLabel('Date') })
  await panel.getByLabel('Date').fill(newDate)
  await panel.getByRole('button', { name: 'Add day' }).click()

  // The sidebar is the @secondaryPanel slot, which is a layout. router.push and
  // router.refresh cannot re-resolve it, so only a server-side revalidatePath
  // puts the new day here. This is the exact failure createRehearsal and
  // deleteTourDate shipped with.
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(1)
})

test('a renamed tour updates in the sidebar and does not snap back', async ({ page }) => {
  const seed = readSeed()
  const newName = 'Renamed Mid Tour'

  await page.goto(`/tours/${seed.a.tourId}/settings`)

  await page.getByLabel('Tour name').fill(newName)
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText(newName).first()).toBeVisible()

  // The React 19 case, and the reason this waits rather than asserting once. An
  // uncontrolled form is reset to its defaultValue after the action resolves,
  // on the assumption that defaultValue is what the server just sent back. If
  // the action does not revalidate, the server component still holds the old
  // name and the field visibly reverts a moment later.
  await page.waitForTimeout(1000)
  await expect(page.getByLabel('Tour name')).toHaveValue(newName)

  // Restore: access.spec.ts asserts on this tour's seeded name, and a spec that
  // leaves a renamed tour behind would make that one pass or fail on ordering.
  await page.getByLabel('Tour name').fill(seed.a.tourName)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByLabel('Tour name')).toHaveValue(seed.a.tourName)
})

// Scoped to the Dates navigation landmark, which is the @secondaryPanel slot
// and the thing this spec is about. The same day links are rendered again by
// date-strip.tsx for mobile, so an unscoped locator finds two elements for one
// day and turns a passing spec into a "duplicate day" failure.
//
// Filtering by :visible instead was worse: it made the assertion depend on the
// viewport and on which of the two containers CSS happened to be showing, and
// it flipped from finding two links to finding none between runs. Counting
// inside the landmark does not care whether it is on screen.
//
// Matched by href rather than by text, because the visible text of a day row is
// a number and a month abbreviation, and those repeat across a tour.
function sidebarLinkFor(page: import('@playwright/test').Page, date: string) {
  return page.getByRole('navigation', { name: 'Dates' }).locator(`a[href*="date=${date}"]`)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
