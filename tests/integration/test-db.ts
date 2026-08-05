import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The service-role client the test suites write through, and the mocked-user
// state that goes with it. Split out of setup.ts (Brief 41) for one reason:
// setup.ts imports `vi` and calls vi.mock at module load, so anything importing
// it is a vitest file by definition. The Playwright global setup seeds through
// tests/integration/fixture.ts and runs in plain Node, where vitest does not
// exist. Everything here is runtime-agnostic; setup.ts keeps the mocks and
// re-exports both of these, so the eleven integration tests importing from
// './setup' are unaffected.

const url = process.env.SUPABASE_TEST_URL
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error(
    [
      'Integration and end-to-end tests need a running Supabase.',
      '',
      'These run in CI only, because they need Docker. If you are seeing this',
      'locally, you want `pnpm test` (unit tests) instead.',
      '',
      'To run them anyway: supabase start, then set SUPABASE_TEST_URL and',
      'SUPABASE_TEST_SERVICE_ROLE_KEY from its output.',
    ].join('\n')
  )
}

// Service role: the integration tests are about write semantics, not
// authorization. The cross-tour tests deliberately use their own RLS-scoped
// client instead, because that is the thing they are checking, and the e2e
// suite drives a real browser holding a real session for the same reason.
export const testDb = createSupabaseClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Set by each test's fixture so the mocked requireUser reports the right owner.
// Inert in the e2e suite, which mocks nothing: there, the session is real.
let testUserId = '00000000-0000-0000-0000-000000000000'

export function setTestUserId(id: string) {
  testUserId = id
}

export function currentTestUserId() {
  return testUserId
}
