import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

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
