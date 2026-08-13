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
// Two things keep it deterministic. Between the steps it waits for the panel to
// fully close before reopening: the side panel stays mounted for 200ms after it
// closes (its exit animation, see app-content.tsx), so reopening too soon lands
// on the same stale, still-focused DayForm instance. And it asserts the preview
// row before pressing Enter, so the highlighted option has settled and Enter acts
// on the row we typed rather than a half-updated one.
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

  const input = page.getByPlaceholder('Try "load in 2pm" or "flight"')

  // '/' opens the typed day-form and autofocuses its input on desktop.
  await page.keyboard.press('/')
  await expect(input).toBeVisible()

  // A TIMES row: typing a load-in with a time commits a day_items row on Enter,
  // no detour into another form. The preview confirms the load-in is highlighted
  // before we commit it.
  await input.fill('load in 10am')
  await expect(page.getByText(/Load-in.*Enter adds it/)).toBeVisible()
  await page.keyboard.press('Enter')

  // The load-in lands on the grid. Scoped to the calendar block (.rbc-event) so
  // it cannot match the form's own Load-in row while the panel is still closing.
  await expect(page.locator('.rbc-event').filter({ hasText: 'Load-in' })).toBeVisible()

  // Wait for the panel to close fully, so the next '/' opens a fresh form rather
  // than the stale one still animating out.
  await expect(input).toBeHidden()

  // '/' again, now for a BOOK row. 'hotel' has structure beyond a time, so Enter
  // opens the hotel add form instead of committing anything.
  await page.keyboard.press('/')
  await expect(input).toBeVisible()
  await input.fill('hotel')
  await expect(page.getByText(/Hotel.*Enter opens the hotel form/)).toBeVisible()
  await page.keyboard.press('Enter')

  // The hotel form's heading is up and the day-form is gone: the door handed off
  // to the category's own form rather than staying on the typed panel.
  await expect(page.getByRole('heading', { name: 'Add hotel' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Add to day' })).toHaveCount(0)
})

// REE-127. A TIMES row typed with no time commits a day_item with starts_at
// null, which the grid cannot place, so it lands in the "No time set" rail
// instead. Before this fix the rail rendered a plain <span>: display-only, no
// way to open it, no way to give it the time it was missing. This proves the
// rail item is a real button that opens the same detail panel a grid block
// does.
test('a rail item with no time set opens its detail panel', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.rehearsalDate}`)

  const input = page.getByPlaceholder('Try "load in 2pm" or "flight"')
  await page.keyboard.press('/')
  await expect(input).toBeVisible()

  // No time on the line, so the preview reads "no time yet" rather than a clock.
  await input.fill('soundcheck')
  await expect(page.getByText(/Soundcheck.*no time yet.*Enter adds it/)).toBeVisible()
  await page.keyboard.press('Enter')

  // Wait for the day-form panel to fully close: it stays mounted for its 200ms
  // exit animation, and its own combo-box rows ("Soundcheck no time yet",
  // "Custom: “Soundcheck” no time") also contain the substring
  // "Soundcheck", which makes an exact-name query below ambiguous while they
  // are still in the DOM.
  await expect(input).toBeHidden()

  // It lands in the rail, not on the grid.
  await expect(page.getByText('No time set')).toBeVisible()
  const railItem = page.getByRole('button', { name: 'Soundcheck', exact: true })
  await expect(railItem).toBeVisible()
  await expect(page.locator('.rbc-event').filter({ hasText: 'Soundcheck' })).toHaveCount(0)

  await railItem.click()

  // The same detail panel a grid block opens: the title and the (empty) Starts
  // field the TM can now fill in.
  await expect(page.getByRole('heading', { name: 'Soundcheck' })).toBeVisible()
  await expect(page.getByLabel('Starts')).toHaveValue('')
})
