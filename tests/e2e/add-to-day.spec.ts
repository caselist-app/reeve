import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-89, "delete the second door". The '+', the '/' shortcut and the mobile FAB
// all open the one typed day-form now; the category popover and its mobile sheet
// are gone. This proves the surviving door reaches both kinds of thing the form
// offers: a TIMES row it commits straight onto the grid (load-in), and a BOOK row
// that opens its own add form (hotel).
//
// NOT repeat-safe: it commits a day_item and never removes it, the same
// limitation revalidate.spec.ts:81 has. Do not run it with --repeat-each; every
// run after the first would find a second Load-in block and report a false
// failure. workers: 1 keeps the e2e suite sequential.

test('the one door adds a timed item and opens a book form', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  // The seeded 16:00 load-in, so the assertions below run against a grid that
  // has actually rendered rather than an empty one that never loaded.
  await expect(page.getByRole('button', { name: /Load-in/ }).first()).toBeVisible()

  // '/' opens the typed day-form and autofocuses its input on desktop.
  await page.keyboard.press('/')
  const input = page.getByPlaceholder('Try "load in 2pm" or "flight"')
  await expect(input).toBeVisible()

  // A TIMES row: typing a load-in with a time commits a day_items row on Enter,
  // no detour into another form.
  await input.fill('load in 10am')
  await page.keyboard.press('Enter')

  // The new block, distinct from the seeded 16:00 one, so this cannot pass on the
  // load-in that was already there.
  await expect(
    page.getByRole('button', { name: /Load-in/ }).filter({ hasText: '10:00' }),
  ).toBeVisible()

  // '/' again, now for a BOOK row. 'hotel' has structure beyond a time, so Enter
  // opens the hotel add form instead of committing anything.
  await page.keyboard.press('/')
  await expect(input).toBeVisible()
  await input.fill('hotel')
  await page.keyboard.press('Enter')

  // The hotel form's heading is up and the day-form is gone: the door handed off
  // to the category's own form rather than staying on the typed panel.
  await expect(page.getByRole('heading', { name: 'Add hotel' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add to day' })).toHaveCount(0)
})
