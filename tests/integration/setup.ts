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

// The client and the mocked-user state live in ./test-db, which imports
// nothing from vitest, so the Playwright global setup can seed through
// fixture.ts without pulling this file's mocks into a plain Node process.
// Re-exported here because every integration test imports them from './setup'.
export { testDb, setTestUserId }

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
// not break these tests for an unrelated reason. When the idempotency tests
// arrive (claim, fail the send, assert the claim is released) this stub is not
// enough: those need a real Redis or a fake that actually stores things.
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

