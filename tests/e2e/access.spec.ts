import { expect, test, request as playwrightRequest } from '@playwright/test'
import { readSeed } from './seed'

// Mirrors playwright.config.ts's own default: that file does not export its
// baseURL, and the "account B" test below needs a request context of its
// own, built with request.newContext() rather than the chromium project's
// request fixture, which already carries account A's storageState.
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'

// Who can open a tour. Two failures that cannot be apologised for, and neither
// has ever been tested anywhere in the repo.
//
// The auth gate is one line. middleware.ts gates nothing: updateSession()
// refreshes the session cookie and returns it, and there is no redirect
// anywhere in lib/supabase/middleware.ts. Every authenticated route in Reeve
// depends on the single requireUser() at the top of app/(app)/layout.tsx.
//
// RLS has no coverage at all. tests/integration/cross-tour.test.ts looks like
// it covers this and deliberately does not: its own header says a second
// account "would prove nothing, because RLS would catch it before the action
// ran", so it uses two tours on ONE account. That is right for cross-tour id
// checks and it leaves the thing RLS actually does untested, because setup.ts
// hands every other integration test a service-role client. This spec is the
// only place a second account exists.

test.describe('a signed-out visitor', () => {
  // Drops the saved session for this file only. Everything else in the suite
  // runs signed in.
  test.use({ storageState: { cookies: [], origins: [] } })

  test('cannot open a tour and lands on the login screen', async ({ page }) => {
    const seed = readSeed()

    await page.goto(`/tours/${seed.a.tourId}/schedule`)

    expect(new URL(page.url()).pathname).toBe('/login')
    // The redirect is not the whole claim. A page that redirected after
    // streaming the schedule would have shown a stranger the tour on the way.
    await expect(page.getByText(seed.a.tourName)).toHaveCount(0)
  })
})

test.describe('one tour manager and another account', () => {
  test('cannot open a tour belonging to a different account', async ({ page }) => {
    const seed = readSeed()

    const response = await page.goto(`/tours/${seed.b.tourId}/schedule`)

    // The claim that matters, asserted on the bytes the server sent: account
    // B's tour name never reaches account A's browser. Everything below is
    // about where the browser ends up, which is a worse thing to have wrong but
    // a lesser thing to leak.
    expect(await response!.text()).not.toContain(seed.b.tourName)

    // The redirect here is NOT an HTTP redirect, and reading page.url() the
    // instant the load event fires says the browser is still on B's tour.
    //
    // Three loading.tsx files sit above this route (app/(app), the schedule
    // folder, and the @secondaryPanel slot), so Next streams the shell before
    // getScheduleShell resolves. By the time the page calls redirect('/') the
    // response is already committed as a 200, so the navigation is delivered
    // inside the stream and performed by the browser afterwards. Poll for it.
    //
    // The signed-out case above is different and genuinely is a 307, because
    // the (app) layout's requireUser() runs before anything streams.
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
      .not.toContain(seed.b.tourId)

    await expect(page.getByText(seed.b.tourName)).toHaveCount(0)
  })

  test('still sees its own tour, so the check above is not passing on a broken page', async ({
    page,
  }) => {
    const seed = readSeed()

    await page.goto(`/tours/${seed.a.tourId}/schedule`)

    await expect(page.getByText(seed.a.tourName).first()).toBeVisible()
  })
})

// REE-202 / Brief 45 step 7. identity_documents is account-level, not
// tour-level, so this is a different shape of isolation from the tests above:
// there is no tour id to redirect away from, only a server action
// (signIdentityDocumentUrl) that either resolves a row or does not.
//
// tests/integration/identity-documents.test.ts cannot cover this: setup.ts
// mocks both createClient and createAdminClient to the same service-role
// testDb, so RLS is never enforced there and an isolation test written in
// that suite would pass for reasons unrelated to RLS. This file is the only
// place a second account exists.
//
// "View scan" has no UI trigger yet (Brief 45 left the [...] menu for a later
// slice), so the action is driven through app/api/dev/e2e-sign-identity-document,
// a dev-only route with the same two guards as e2e-login, purely so this spec
// can call it with a real, cookie-carrying request from each account.
//
// Account B needs its own session, not account A's: the chromium project's
// request fixture already carries account A's storageState, so this spec
// opens a fresh, empty context and signs in as account B within it, the same
// way auth.setup.ts signs in account A from a context with no prior session.
test.describe('identity document isolation', () => {
  test('account B cannot sign account A\'s identity document', async () => {
    const seed = readSeed()
    const secret = process.env.E2E_LOGIN_SECRET
    if (!secret) {
      throw new Error('E2E_LOGIN_SECRET is not set, so account B cannot sign in.')
    }

    const accountB = await playwrightRequest.newContext({ baseURL: BASE_URL })
    try {
      const loginResponse = await accountB.post('/api/dev/e2e-login', {
        headers: { 'x-e2e-secret': secret },
        data: { email: seed.b.email },
      })
      expect(loginResponse.status()).toBe(200)

      const signResponse = await accountB.post('/api/dev/e2e-sign-identity-document', {
        headers: { 'x-e2e-secret': secret },
        data: { documentId: seed.a.identityDocumentId },
      })

      expect(signResponse.status()).toBe(200)
      const body = await signResponse.json()
      expect(body.error).not.toBeNull()
      expect(body.url).toBeNull()
    } finally {
      await accountB.dispose()
    }
  })

  // Not passing on a broken action: the same document id, called by the
  // account that actually owns it, must resolve to a signed URL.
  test('account A can sign its own identity document', async ({ request }) => {
    const seed = readSeed()
    const secret = process.env.E2E_LOGIN_SECRET
    if (!secret) {
      throw new Error('E2E_LOGIN_SECRET is not set.')
    }

    const signResponse = await request.post('/api/dev/e2e-sign-identity-document', {
      headers: { 'x-e2e-secret': secret },
      data: { documentId: seed.a.identityDocumentId },
    })

    expect(signResponse.status()).toBe(200)
    const body = await signResponse.json()
    expect(body.error).toBeNull()
    expect(body.url).not.toBeNull()
  })
})
