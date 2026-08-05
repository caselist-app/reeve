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

    await page.goto(`/tours/${seed.b.tourId}/schedule`)

    // The schedule page redirects to / when getScheduleShell returns no tour,
    // which is what RLS causes here: account A is signed in, and account B owns
    // this tour.
    expect(new URL(page.url()).pathname).not.toContain(seed.b.tourId)
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
