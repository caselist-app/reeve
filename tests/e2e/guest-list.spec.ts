import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// Brief 52, step 4 (REE-131). The Guest list block in day info opens the panel,
// and a name added in the panel updates the block's count without a reload. That
// last assertion is the one that proves createGuestEntry revalidates the schedule
// route: the block is server-rendered in DayContent, so if the revalidate is
// dropped the count stays "No names yet" and this goes red, exactly the way
// revalidate.spec.ts catches the edit-then-look-away class.
//
// REPEAT-SAFE, deliberately, and it has to be: the only way an intermittent
// failure is ever proved fixed is --repeat-each, and add-to-day.spec.ts and
// revalidate.spec.ts:81 both forfeit that by leaving a row behind. This one adds
// a name and then removes it through the same panel, so every run starts from the
// empty list it found. A removed row is a soft delete excluded from the count and
// from the surname match, so a second run adds cleanly on top of the first.

test('the guest list block opens the panel and its count tracks an add without a reload', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  // The block renders on the show day, under Venue. It starts empty: no other
  // spec adds a guest to this show, and this one cleans up after itself.
  const block = page.getByRole('button', { name: /Guest list/ })
  await expect(block).toBeVisible()
  await expect(block).toContainText('No names yet')

  // Clicking it opens the panel. The "Add to the list" button is unique to the
  // guest list panel, so it distinguishes this panel from the venue panel, which
  // shares the venue name as its title.
  await block.click()
  const addButton = page.getByRole('button', { name: 'Add to the list' })
  await expect(addButton).toBeVisible()

  // Add a name. The TM's own add lands approved, so it counts immediately.
  await page.locator('input[name="first_name"]').fill('Ada')
  await page.locator('input[name="last_name"]').fill('Lovelace')
  await addButton.click()

  // The name appears in the panel's "On the list" group.
  await expect(page.getByText('Ada Lovelace')).toBeVisible()

  // The block's count moves from 0 to 1 with no reload anywhere in this test. If
  // createGuestEntry stops revalidating the schedule route, the panel still shows
  // the name but the block stays "No names yet" and this line fails.
  await expect(block).toContainText('1 name')

  // Cleanup, so the spec is repeat-safe: remove the name through the row's
  // options menu, which soft-deletes it (status 'removed'). Asserted on the
  // panel, which re-reads its list client-side and is deterministic, rather than
  // on the block: the block's server re-render after a delete is the flaky
  // cross-route refresh, and the add assertion above already proves the
  // revalidate. The name gone from the panel proves the row is off the list.
  await page.getByRole('button', { name: 'Options for Ada Lovelace' }).click()
  await page.getByRole('menuitem', { name: 'Remove from the list' }).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()

  await expect(page.getByText('Ada Lovelace')).toBeHidden()
})
