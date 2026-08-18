import { expect, test } from '@playwright/test'
import { E2E_SEEDED_LOAD_IN_LOCAL } from '../integration/fixture'
import { readSeed } from './seed'

// REE-192. Clicking a grid block opened its detail panel; clicking the same
// block again reopened the identical panel rather than closing it, a silent
// no-op from the TM's point of view. This is a toggle: the second click on the
// block whose panel is already open closes it (day-calendar.tsx's openRecord),
// and a click on a different block still opens that block's panel as before.

test('clicking an open day item again closes its panel', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  const loadInCard = page.getByRole('button', { name: /Load-in/ }).first()
  await expect(loadInCard).toContainText(E2E_SEEDED_LOAD_IN_LOCAL)

  await loadInCard.click()
  await expect(page.getByText('On this day')).toBeVisible()

  await loadInCard.click()
  await expect(page.getByText('On this day')).not.toBeVisible()
})
