import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// REE-196 / Brief 45. identity_documents carries its guarantees as a check
// constraint and two partial unique indexes, and neither exists in the
// generated TypeScript types: a check constraint only lives in a real
// Postgres. So these write directly through testDb, bypassing any action, and
// assert the database itself rejects the bad row.
//
// Failures are asserted on the Postgres error code, not merely on "an error
// happened". A typo in a column name also errors, and a test that accepts any
// error passes for the wrong reason. 23514 is check_violation, 23505 is
// unique_violation.
//
// identity_documents_one_primary_per_kind_idx is the one worth being
// suspicious of: it is unique on (contact_id, kind) where is_primary. Drop the
// kind column from that index (unique on contact_id alone, still partial on
// is_primary) and it stops being "one primary per kind" and becomes "one
// primary per contact", so a primary passport and a primary visa for the same
// contact collide. That is exactly the failure the second describe block below
// would catch: written red first against that narrower index, it failed with
// 23505 on the visa insert, and passed once kind was added back to the index.

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

describe('the identity_documents schema enforces its constraints', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  function document(overrides: Record<string, unknown> = {}) {
    return {
      account_id: fixture.userId,
      contact_id: fixture.contactId,
      kind: 'passport',
      storage_path: `${fixture.userId}/${fixture.contactId}/test.pdf`,
      file_name: 'test.pdf',
      mime_type: 'application/pdf',
      byte_size: 1024,
      ...overrides,
    }
  }

  describe('identity_documents_one_primary_per_kind_idx', () => {
    it('rejects a second primary passport for the same contact', async () => {
      const first = await testDb
        .from('identity_documents')
        .insert(document({ is_primary: true }))
      expect(first.error).toBeNull()

      const second = await testDb
        .from('identity_documents')
        .insert(document({ is_primary: true }))
      expect(second.error?.code).toBe(UNIQUE_VIOLATION)
    })

    it('allows a primary passport and a primary visa for the same contact', async () => {
      // Proves the index is per-kind: two different kinds may each hold their
      // own primary at once.
      const passport = await testDb
        .from('identity_documents')
        .insert(document({ kind: 'passport', is_primary: true }))
      expect(passport.error).toBeNull()

      const visa = await testDb
        .from('identity_documents')
        .insert(document({ kind: 'visa', is_primary: true }))
      expect(visa.error).toBeNull()
    })
  })

  describe('identity_documents_visa_fields', () => {
    it('rejects a passport carrying a visa-only field', async () => {
      const visa = await testDb
        .from('identity_documents')
        .insert(document({ kind: 'visa', valid_for_country: 'USA' }))
      expect(visa.error).toBeNull()

      const passport = await testDb
        .from('identity_documents')
        .insert(document({ kind: 'passport', valid_for_country: 'USA' }))
      expect(passport.error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts a visa carrying valid_for_country', async () => {
      const { error } = await testDb
        .from('identity_documents')
        .insert(document({ kind: 'visa', valid_for_country: 'USA', visa_type: 'P-2' }))
      expect(error).toBeNull()
    })
  })
})
