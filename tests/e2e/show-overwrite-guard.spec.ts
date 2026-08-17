import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-97. create_show_with_dependents used to upsert tour_dates.day_type to
// 'show' unconditionally: a TM who set a day to Press, then added a venue to
// it, silently lost the Press classification with no warning. This proves the
// fix from the TM's side: adding a show to a day that already carries a
// deliberate, non-default type is blocked with a clear error rather than
// applied silently. 'Hellfest' is a known venue (lib/logistics/hub-resolver.ts)
// so createShow's inline hub resolution takes over and the action never
// reaches resolveHubJob.trigger(), which needs a running Trigger.dev this
// suite does not have; irrelevant here anyway, since the RPC blocks before any
// row is written.
//
// This is the only way to exercise the new guard for real: it lives in
// create_show_with_dependents, which gates on owns_tour() and therefore
// auth.uid(), so the integration suite's service-role client cannot call it
// (see tests/integration/create-show-revalidate.test.ts).
//
// NOT repeat-safe: it adds a day and never removes it, the same limitation
// revalidate.spec.ts:81 has. workers: 1 (playwright.config.ts) keeps the e2e
// suite sequential.
test('adding a venue to a Press day is blocked, not silently converted', async ({ page }) => {
  const seed = readSeed()
  const newDate = addDays(seed.a.date, 45)

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  // Add a Press day the same way revalidate.spec.ts adds a rehearsal day.
  await page.getByRole('button', { name: 'Add day' }).click()
  await page.getByRole('button', { name: /Press/ }).click()
  const addPanel = page.locator('form').filter({ has: page.getByLabel('Date') })
  await addPanel.getByLabel('Date').fill(newDate)
  await addPanel.getByRole('button', { name: 'Add day' }).click()

  await sidebarLinkFor(page, newDate).click()
  await expect(page).toHaveURL(new RegExp(`date=${newDate}`))

  // Edit the day, switch its type to Show, and try to add a venue. The day
  // type Select has no htmlFor/id linking it to its <Label> (same gap noted in
  // revalidate.spec.ts for the timeline panel's time fields), and it is the
  // only combobox this page renders, so role alone is a stable handle.
  await page.getByRole('button', { name: 'Day options' }).click()
  await page.getByRole('menuitem', { name: 'Edit day' }).click()

  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Show Day' }).click()

  await page.getByLabel('Venue').fill('Hellfest')
  await page.getByRole('button', { name: 'Add show' }).click()

  // The RPC's block, surfaced verbatim through createShow's error return.
  await expect(page.getByText(/already a Press day/i)).toBeVisible()

  // Nothing was written: reopening Edit day still finds the day type
  // unchanged, rather than a show that landed with the type overwrite blocked
  // out from under it.
  await page.getByRole('button', { name: 'Close panel' }).click()
  await page.getByRole('button', { name: 'Day options' }).click()
  await page.getByRole('menuitem', { name: 'Edit day' }).click()
  await expect(page.getByRole('combobox')).toContainText('Press Day')
})

function sidebarLinkFor(page: import('@playwright/test').Page, date: string) {
  return page.getByRole('navigation', { name: 'Dates' }).locator(`a[href*="date=${date}"]`)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
