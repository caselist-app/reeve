import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-89, "delete the second door". The '+', the '/' shortcut and the mobile FAB
// all open the one typed day-form now; the category popover and its mobile sheet
// are gone. This proves the surviving door reaches both kinds of thing the form
// offers: a TIMES row it commits straight onto the grid (load-in), and a BOOK row
// that opens its own add form (hotel).
//
// It runs against the seeded rehearsal day, not the show day, on purpose. The
// show day carries the 16:00 load-in that revalidate.spec.ts reads with a
// `.first()`, and a stray 10:00 load-in there would shadow it. The rehearsal day
// starts empty and no other spec reads its grid.
//
// NOT repeat-safe: it commits a day_item and never removes it, the same
// limitation revalidate.spec.ts:81 has. Do not run it with --repeat-each; every
// run after the first would find a second Load-in block and report a false
// failure. workers: 1 keeps the e2e suite sequential.

test('the one door adds a timed item and opens a book form', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.rehearsalDate}`)

  // The single '+' is the surviving door, and waiting on it proves the day view
  // has hydrated so the '/' listener is attached before we press it.
  await expect(page.getByRole('button', { name: 'Add to day' })).toBeVisible()

  // '/' opens the typed day-form and autofocuses its input on desktop.
  await page.keyboard.press('/')
  const input = page.getByPlaceholder('Try "load in 2pm" or "flight"')
  await expect(input).toBeVisible()

  // A TIMES row: typing a load-in with a time commits a day_items row on Enter,
  // no detour into another form.
  await input.fill('load in 10am')
  await page.keyboard.press('Enter')

  // The load-in lands on the grid. The empty rehearsal day had none, so this
  // cannot pass on a block that was already there.
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
