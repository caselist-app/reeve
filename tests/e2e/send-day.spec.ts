import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-105. This spec never presses the confirm button: the e2e harness has no
// running Trigger.dev, so a real send would either fail outright or, worse,
// succeed against a live WhatsApp/email send if the run happens to carry live
// credentials. Cancel is the only button this spec clicks. It only reads the
// seeded show day and its "Day options" menu, so it is repeat-safe: it
// creates nothing, and running it any number of times leaves no trace.
test('Send the day appears on a show day, names a count, and disappears elsewhere', async ({ page }) => {
  const seed = readSeed()

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  await page.getByRole('button', { name: 'Day options' }).click()
  const sendItem = page.getByRole('menuitem', { name: 'Send the day' })
  await expect(sendItem).toBeVisible()
  await sendItem.click()

  // The seeded crew member has a WhatsApp number (tests/integration/fixture.ts),
  // so the dialog settles on the ready state and names a real count rather
  // than the zero-recipients copy.
  await expect(page.getByText(/Send the day to \d+ crew\?/)).toBeVisible()

  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText(/Send the day to \d+ crew\?/)).not.toBeVisible()
  // Nothing was queued: Cancel is the only button pressed, so resendDay was
  // never called and no "Sent to N crew." toast can have fired.
  await expect(page.getByText(/^Sent to \d+ crew\.$/)).toHaveCount(0)

  // A non-show day (the seeded rehearsal) gets no "Send the day" item at all,
  // absent rather than disabled.
  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.rehearsalDate}`)
  await page.getByRole('button', { name: 'Day options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Send the day' })).toHaveCount(0)
})
