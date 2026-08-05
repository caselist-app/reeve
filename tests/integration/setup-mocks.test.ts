import { describe, it, expect } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/helpers'
import { revalidatePath } from 'next/cache'
import { testDb, setTestUserId } from './test-db'

// Guards setup.ts itself. Every other test in this suite assumes the four mocks
// below are in place, and none of them would say so if they were not: a test
// that cannot reach the database fails on the database, which reads like a
// product bug or a flaky runner.
//
// Written on 2026-08-05 after the client was split into ./test-db (so the
// Playwright global setup could seed without importing vitest) and setup.ts
// briefly re-exported it. A setup file is transformed with the mock registry
// applied, so a test importing testDb through setup.ts got a different instance
// from the one the mock factories close over. createClient() silently stopped
// being the test database. Nothing failed to compile and 60 tests went red.
//
// Import the client from './test-db', never through './setup'.

describe('the integration suite is really mocking what it thinks it is', () => {
  it('gives a server action the test database, not one built from cookies()', async () => {
    expect(await createClient()).toBe(testDb)
  })

  it('gives an admin-client caller the same test database', () => {
    expect(createAdminClient()).toBe(testDb)
  })

  it('reports the fixture account as the signed-in user', async () => {
    const userId = '11111111-1111-1111-1111-111111111111'
    setTestUserId(userId)

    expect((await requireUser()).id).toBe(userId)
  })

  it('lets an action call revalidatePath outside a render', () => {
    expect(() => revalidatePath('/tours/1/schedule')).not.toThrow()
  })
})
