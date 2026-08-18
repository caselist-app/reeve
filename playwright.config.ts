import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE_PATH } from './tests/e2e/seed'

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

  // Seeds two accounts before anything runs, and deletes both auth users after,
  // which cascades the rest away.
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  use: {
    baseURL,
    trace: 'retain-on-failure',
  },

  projects: [
    // Signs in once and saves the session. Everything else depends on it, so a
    // failure here fails the run rather than producing twenty pages that all
    // "redirect to /login".
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE_PATH },
    },
  ],

  // Serves a real production build, the same command Vercel runs. Not `pnpm
  // dev`: a dev build has different error handling and would hide the exact
  // failure this suite exists to catch.
  //
  // `pnpm exec next start` rather than `pnpm start`: one fewer layer of shell
  // indirection between the process Playwright spawns and the actual
  // `next-server`, so the SIGTERM below has the shortest possible path to it.
  //
  // gracefulShutdown asks nicely before Playwright's default teardown, which
  // is an unconditional SIGKILL of the process group it spawned. That default
  // has still been seen to leave a `next-server` grandchild alive on port 3000
  // after the group dies (REE-121): the leaked process holds the CI runner's
  // stdio pipe open, so the e2e job finishes every step green and then never
  // finalizes. SIGTERM gives `next start` the chance to close its own
  // listeners and exit on its own, which is the shutdown path that does not
  // leave that grandchild behind. See tests/README.md for the CI-side backstop.
  webServer: {
    command: 'pnpm exec next start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
  },
})
