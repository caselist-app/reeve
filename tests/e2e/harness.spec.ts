import { expect, test } from '@playwright/test'

// The harness proof. This spec exists to show that the CI job is really
// building the app, really serving it, and really driving a browser at it.
// Everything else in tests/e2e is worthless if this passes vacuously, so it
// asserts on text the app renders rather than on a status code, and it was
// observed red (webServer pointed at the wrong port) before it was observed
// green.
//
// /login is the one authenticated-adjacent page that needs no session and no
// seed, which is why it is the first thing this suite loads.

test('a signed-out visitor to the login page is told where they are', async ({ page }) => {
  await page.goto('/login')

  await expect(page.getByText('Sign in to Reeve')).toBeVisible()
})
