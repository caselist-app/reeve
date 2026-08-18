import { vi } from 'vitest'
import { testDb, setTestUserId, currentTestUserId } from './test-db'

// Integration tests call the real server actions, so the real write logic runs
// against a real Postgres. Only the Next.js runtime plumbing is replaced,
// because none of it exists outside a request:
//
//   next/cache            revalidatePath throws outside a Next render
//   @/lib/supabase/server createClient reads cookies() which needs a request
//   @/lib/auth/helpers    requireUser redirects, and redirect() needs a router
//
// Everything below that line is real: real PostgREST, real SQL, real
// constraints, real migrations. That matters, because the bugs this suite
// exists to catch (partial writes nulling columns, PostgREST embed semantics)
// only exist at that layer. A mocked Supabase client would pass on all of them.

// The client and the mocked-user state live in ./test-db, which imports nothing
// from vitest, so the Playwright global setup can seed through fixture.ts
// without pulling this file's mocks into a plain Node process.
//
// Import them from './test-db', never from here. This file was briefly
// re-exporting both, and it silently broke every mock: a setup file is
// transformed with the mock registry applied, so a test importing testDb
// through it got a different instance from the one the factories below close
// over, and `createClient()` stopped being the test database. Nothing failed to
// compile. 60 integration tests went red at once, which is the only reason it
// was caught in the same hour.

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => testDb,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => testDb,
}))

// lib/redis.ts constructs an Upstash client at module load, so simply importing
// any action logs two warnings and then one more per cache-bust. None of it
// fails a test, because the cache-bust is fire-and-forget, but noise is how a
// real failure gets missed later.
//
// A Proxy rather than a list of methods, so adding a Redis call somewhere does
// not break these tests for an unrelated reason. It cannot represent a held
// claim at all, which is why tests/integration/inbound-claim-redis.test.ts
// (REE-32, Brief 38 Part 3: claim, fail the send, assert the claim is
// released) calls vi.unmock('@/lib/redis') to opt out of this stub and run
// against the real Redis CI's integration job starts for exactly that test.
vi.mock('@/lib/redis', () => ({
  redis: new Proxy(
    {},
    { get: () => async () => null }
  ),
}))

vi.mock('@/lib/auth/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/helpers')>()
  return {
    ...actual,
    requireUser: async () => ({ id: currentTestUserId() }),
    getCurrentUser: async () => ({ id: currentTestUserId() }),
  }
})

