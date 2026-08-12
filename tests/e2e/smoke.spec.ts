import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { readSeed } from './seed'

// Every page in the app, opened in a real browser against a real database.
//
// This is the gap the whole brief exists to close. `next build` prerenders six
// routes and not one of them is under app/(app), because the (app) layout reads
// cookies() and everything below it is dynamic. So a Server Component that
// throws on the schedule, the roster or a planner passes typecheck, lint,
// check:conventions, the unit tests and the build, and then serves a 500 to the
// only person using the product.
//
// Routes are written as templates rather than resolved URLs so the failing line
// in CI names the route ("/tours/{tourId}/schedule") rather than a URL full of
// UUIDs. Resolving happens inside the test, which also keeps the seed file read
// out of the collection phase.

const AUTHENTICATED_ROUTES = [
  '/',
  '/home',
  '/roster',
  '/roster/{contactId}',
  '/settings',
  '/artists/new',
  '/artists/{artistId}/settings',
  '/tours/new',
  '/tours/{tourId}',
  '/tours/{tourId}/schedule',
  '/tours/{tourId}/schedule/{date}',
  '/tours/{tourId}/people',
  '/tours/{tourId}/shows/{showId}/planner',
  '/tours/{tourId}/shows/{showId}/hotels',
  '/tours/{tourId}/shows/{showId}/hotels/{stayId}',
  '/tours/{tourId}/hotels',
  '/tours/{tourId}/transport',
  '/tours/{tourId}/transport/planner',
  '/tours/{tourId}/settings',
  '/tours/{tourId}/extractions',
  '/tours/{tourId}/rehearsals/{rehearsalId}',
]

// Reachable with no session at all. Visited signed out, below.
const PUBLIC_ROUTES = ['/login', '/signup', '/privacy', '/terms', '/data-deletion']

// Under app/(app), so gated by the single requireUser() in its layout, and
// therefore part of the count check below. `/` and `/home` are not: they sit
// outside that group and handle their own auth.
const APP_GROUP_ROUTE_COUNT = AUTHENTICATED_ROUTES.length - 2

// Deliberately out of scope, per the brief. It reads a real file out of a
// storage bucket, so seeding it is a materially bigger job than the rest of the
// fixture. It is the first thing to add after the add flows.
const OUT_OF_SCOPE = ['app/a/[token]/page.tsx']

function resolve(template: string): string {
  const seed = readSeed()

  return template
    .replace('{tourId}', seed.a.tourId)
    .replace('{artistId}', seed.a.artistId)
    .replace('{contactId}', seed.a.contactId)
    .replace('{showId}', seed.a.showId)
    .replace('{stayId}', seed.a.hotelStayId)
    .replace('{rehearsalId}', seed.a.rehearsalId)
    .replace('{date}', seed.a.date)
}

// Four assertions, because a broken page shows up in four different ways and
// because three of them can be satisfied by a page that never rendered.
//
//   status        a thrown Server Component. Verified: in a production build
//                 that is a 500, and there is no error text in the HTML, so
//                 this assertion is the one doing the work.
//   pageerror     a client component that throws after hydration.
//   error text    a Server Component that throws inside a Suspense boundary,
//                 which renders an error state under a perfectly healthy 200.
//   final path    the session still applies. Without this, losing the storage
//                 state turns every authenticated route into a redirect to
//                 /login, which answers 200, and twenty broken pages report as
//                 twenty working ones. `waitUntil: 'load'` rather than
//                 domcontentloaded so a streamed failure has arrived before any
//                 of this is read.
async function assertRenders(page: Page, path: string, opts: { signedIn: boolean }) {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const response = await page.goto(path, { waitUntil: 'load' })

  expect(response, `${path} returned no response`).not.toBeNull()
  expect(response!.status(), `${path} returned ${response!.status()}`).toBeLessThan(400)

  if (opts.signedIn) {
    const landedOn = new URL(page.url()).pathname
    expect(landedOn, `${path} bounced to the login screen, so the session is not applying`).not.toBe(
      '/login'
    )
  }

  await expect(page.getByText('Application error')).toHaveCount(0)
  expect(pageErrors, `${path} threw in the browser`).toEqual([])
}

test.describe('every page renders for a signed-in tour manager', () => {
  for (const template of AUTHENTICATED_ROUTES) {
    test(template, async ({ page }) => {
      await assertRenders(page, resolve(template), { signedIn: true })
    })
  }
})

test.describe('the public pages render with no session', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const path of PUBLIC_ROUTES) {
    test(path, async ({ page }) => {
      await assertRenders(page, path, { signedIn: false })
    })
  }

  test('a signed-out visitor to the front door lands on the marketing page', async ({ page }) => {
    await page.goto('/')

    // Not /login. The front door is app/page.tsx, which calls getCurrentUser()
    // itself and sends a visitor with no session to /home.
    await expect(page).toHaveURL(/\/home$/)
  })
})

// The brief accepted, rather than solved, that adding a route and forgetting to
// list it here fails nothing. This closes that at the only point it can be
// closed cheaply: the count. It cannot tell you which route is missing, but it
// fails on the commit that adds one, which is when someone can still remember
// what it needs to render.
test('every page under app/(app) is in the list above', () => {
  const pages = pageFilesUnder(join('app', '(app)'))
    // A parallel route slot, not a route a TM can open. Its page.tsx is the
    // required routable leaf and renders null; the Dates panel itself is the
    // sibling layout.tsx.
    .filter((f) => !f.includes('@secondaryPanel'))
    .filter((f) => !OUT_OF_SCOPE.includes(f))

  // Guards the assertion below, the same way no-retired-routes.test.ts guards
  // its glob: a walk that silently found nothing would make the count check
  // pass while checking not one file. The two list lengths are here for the
  // same reason: an empty list produces no tests at all, and a suite that runs
  // nothing reports green.
  expect(pages.length).toBeGreaterThan(10)
  expect(AUTHENTICATED_ROUTES.length).toBe(21)
  expect(PUBLIC_ROUTES.length).toBe(5)
  expect(pages.length, `app/(app) pages:\n${pages.join('\n')}`).toBe(APP_GROUP_ROUTE_COUNT)
})

function pageFilesUnder(dir: string): string[] {
  const out: string[] = []

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...pageFilesUnder(path))
    else if (entry === 'page.tsx') out.push(path)
  }

  return out
}
