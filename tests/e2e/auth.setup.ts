import { expect, test as setup } from '@playwright/test'
import { readSeed, STORAGE_STATE_PATH } from './seed'

// Signs in once, as account A, and saves the session for every spec that
// follows. Declared as a setup project in playwright.config.ts, with the
// chromium project depending on it.
//
// This posts to the dev login route rather than driving the login form.
// requestOtpAction calls otpRatelimit.limit() unwrapped and by design, because
// that limiter is a security control against account enumeration, and CI has no
// Upstash, so the form throws before a code is ever sent. See the route for the
// full reasoning.

setup('the seeded tour manager signs in', async ({ request }) => {
  const secret = process.env.E2E_LOGIN_SECRET
  if (!secret) {
    // Thrown rather than skipped. A suite that silently ran signed out would
    // report every authenticated route as a redirect to /login, which reads as
    // twenty broken pages instead of one missing secret.
    throw new Error(
      'E2E_LOGIN_SECRET is not set, so no spec can sign in. In CI it comes from ' +
        'the repo secrets (Settings, Secrets and variables, Actions).'
    )
  }

  const seed = readSeed()

  const response = await request.post('/api/dev/e2e-login', {
    headers: { 'x-e2e-secret': secret },
    data: { email: seed.a.email },
  })

  expect(response.status()).toBe(200)

  await request.storageState({ path: STORAGE_STATE_PATH })
})
