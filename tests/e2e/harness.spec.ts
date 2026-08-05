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

// The dev login route mints a session from an email, so its two guards are the
// only thing between it and anyone who finds the URL. They are asserted here
// rather than trusted, and scripts/check-conventions.mjs Rule 9 fails the build
// if either one is deleted from the route.

test('the dev login route does not admit that it exists to a caller with no secret', async ({
  request,
}) => {
  const response = await request.post('/api/dev/e2e-login', {
    data: { email: 'nobody@example.test' },
  })

  expect(response.status()).toBe(404)
})

test('the dev login route refuses a caller presenting the wrong secret', async ({ request }) => {
  const response = await request.post('/api/dev/e2e-login', {
    headers: { 'x-e2e-secret': 'not-the-secret' },
    data: { email: 'nobody@example.test' },
  })

  // A 404 here rather than a 403 means E2E_LOGIN_SECRET is not set on the
  // server, so the first guard is answering and nothing below it has run. Add
  // it to the GitHub repo secrets: Settings, Secrets and variables, Actions.
  expect(response.status()).toBe(403)
})
