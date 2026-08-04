import { vi } from 'vitest'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

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

const url = process.env.SUPABASE_TEST_URL
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  throw new Error(
    [
      'Integration tests need a running Supabase.',
      '',
      'These run in CI only, because they need Docker. If you are seeing this',
      'locally, you want `pnpm test` (unit tests) instead.',
      '',
      'To run them anyway: supabase start, then set SUPABASE_TEST_URL and',
      'SUPABASE_TEST_SERVICE_ROLE_KEY from its output.',
    ].join('\n')
  )
}

// Service role: these tests are about write semantics, not authorization.
// The cross-tour tests deliberately use their own RLS-scoped client instead,
// because that is the thing they are checking.
export const testDb = createSupabaseClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

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

vi.mock('@/lib/auth/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/helpers')>()
  return {
    ...actual,
    requireUser: async () => ({ id: currentTestUserId() }),
    getCurrentUser: async () => ({ id: currentTestUserId() }),
  }
})

// Set by each test's fixture so the mocked requireUser reports the right owner.
let testUserId = '00000000-0000-0000-0000-000000000000'
export function setTestUserId(id: string) {
  testUserId = id
}
function currentTestUserId() {
  return testUserId
}
