import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: real browser, real production build, real database.
//
// This is the layer above the vitest suites. Those stop at the server action,
// so nothing in the repo currently loads a page a TM opens. `pnpm build`
// prerenders six routes and not one of them is under app/(app), because the
// (app) layout reads cookies() and every route below it is therefore dynamic.
// A Server Component that throws on the schedule passes typecheck, lint,
// check:conventions, the unit tests and the build, and then serves a 500.
//
// CI only, like the integration suite and for the same reason: a real Supabase
// needs Docker and Matt does not run it. `pnpm check` must never invoke this.
// See tests/README.md.

// Overridable so a future job can point the suite at a deployed URL. The
// default is what the webServer below starts.
const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './tests/e2e',

  // One worker, no parallelism. These specs write real rows into one database,
  // and a parallel run would produce failures that look like product bugs.
  // Note this makes them sequential, not independent: a spec still must not
  // depend on another spec's writes.
  workers: 1,
  fullyParallel: false,

  // No retries, deliberately. A retry hides a flake, and a hidden flake is how
  // a suite stops meaning anything. The discipline that makes this survivable
  // is in tests/README.md: a spec that fails intermittently is deleted the same
  // day it is noticed, not quarantined and not retried.
  retries: 0,

  // A .only left in a spec silently shrinks the suite to one test while CI
  // stays green. Fail the run instead.
  forbidOnly: !!process.env.CI,

  // list prints every spec name into the CI log, which is the only place Matt
  // reads a failure. The HTML report is uploaded as an artifact for the detail.
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  outputDir: 'test-results',

  use: {
    baseURL,
    trace: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Serves a real production build, the same command Vercel runs. Not `pnpm
  // dev`: a dev build has different error handling and would hide the exact
  // failure this suite exists to catch.
  webServer: {
    command: 'pnpm start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
