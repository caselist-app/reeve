import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-36. Rehearsal editing used to live on its own route,
// /tours/[id]/rehearsals/[rehearsalId], and nothing in the day view linked to
// it: CLAUDE.md's "never route away from the day view for any add or edit
// action" rule, live-broken. This proves the day view's own door: the
// Rehearsal block in day info opens the rehearsal in the side panel, prefilled
// with its seeded data, and a save there is visible without a reload.
//
// Restores what it changes, the same discipline as revalidate.spec.ts's
// load-in edit, so nothing downstream reads a location this spec invented.

test('the Rehearsal block opens the rehearsal in the side panel and a save sticks', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.rehearsalDate}`)

  const panel = page.getByTestId('day-info-panel')
  const rehearsalBlock = panel.getByRole('button', { name: /Seeded Rehearsal Rooms/ })
  await expect(rehearsalBlock).toBeVisible()
  await rehearsalBlock.click()

  await expect(page.getByRole('heading', { name: 'Seeded Rehearsal Rooms' })).toBeVisible()

  const locationInput = page.getByLabel('Location')
  await expect(locationInput).toHaveValue('Seeded Rehearsal Rooms')

  const newLocation = 'Metropolis Rehearsal Rooms'
  await locationInput.fill(newLocation)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()

  // No reload anywhere in this test. If updateRehearsal stops revalidating the
  // schedule route, the block still reads the old location and this line goes
  // red.
  await expect(panel.getByRole('button', { name: new RegExp(newLocation) })).toBeVisible()

  // Restore.
  await locationInput.fill('Seeded Rehearsal Rooms')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByRole('button', { name: /Seeded Rehearsal Rooms/ })).toBeVisible()
})
