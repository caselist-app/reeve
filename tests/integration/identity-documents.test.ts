import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { sortIdentityDocuments } from '@/lib/identity/kinds'
import { expiryStatus } from '@/lib/roster/expiry'
import {
  createIdentityDocument,
  setPrimaryIdentityDocument,
  deleteIdentityDocument,
} from '@/lib/actions/identity-documents'

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

// REE-198 / Brief 45 step 3. sortIdentityDocuments is the ordering function
// the Identity section renders from. Rows are seeded out of order (visa
// first, primary passport last) so the assertion only passes if the function
// actually reorders them: sorting the fetched rows by created_at, the naive
// first attempt, fails this on the insertion order alone.
describe('sortIdentityDocuments orders primary first, then expiry ascending, passports before visas', () => {
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

  it('returns primary passport, other passport, then visa', async () => {
    const { data: visa } = await testDb
      .from('identity_documents')
      .insert(document({ kind: 'visa', expiry_date: '2027-01-01' }))
      .select()
      .single()

    const { data: otherPassport } = await testDb
      .from('identity_documents')
      .insert(document({ kind: 'passport', expiry_date: '2030-01-01' }))
      .select()
      .single()

    const { data: primaryPassport } = await testDb
      .from('identity_documents')
      .insert(document({ kind: 'passport', is_primary: true, expiry_date: '2029-01-01' }))
      .select()
      .single()

    const { data: rows } = await testDb
      .from('identity_documents')
      .select('*')
      .eq('contact_id', fixture.contactId)
      .order('created_at')

    const ordered = sortIdentityDocuments(rows ?? [])

    expect(ordered.map((d) => d.id)).toEqual([primaryPassport!.id, otherPassport!.id, visa!.id])
  })

  it('treats a null expiry_date as status none, not a thrown error', async () => {
    const { data: row } = await testDb
      .from('identity_documents')
      .insert(document({ expiry_date: null }))
      .select()
      .single()

    expect(() => expiryStatus(row!.expiry_date)).not.toThrow()
    expect(expiryStatus(row!.expiry_date)).toBe('none')
  })
})

// REE-199 / Brief 45 step 4. createIdentityDocument, exercised through the real
// action rather than a raw testDb insert like the blocks above: the upload, the
// storage path, and the first-of-kind primary rule all live in the action, not
// in the schema.

function pdfFile(name: string): File {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

// destroyFixture only deletes the auth user; the cascade never reaches
// storage, so every test below that uploads deletes its own object.
async function cleanupUploadedObject(documentId: string) {
  const { data: row } = await testDb
    .from('identity_documents')
    .select('storage_path')
    .eq('id', documentId)
    .maybeSingle()
  if (row) await testDb.storage.from('identity-documents').remove([row.storage_path])
}

describe('createIdentityDocument uploads a scan and creates its row', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('stores the object under the account id and links it from the row', async () => {
    const fd = new FormData()
    fd.set('kind', 'passport')
    fd.set('file', pdfFile('passport.pdf'))

    const result = await createIdentityDocument(fixture.contactId, fd)
    expect(result.error).toBeNull()
    expect(result.documentId).not.toBeNull()

    try {
      const { data: row, error } = await testDb
        .from('identity_documents')
        .select('storage_path, account_id, contact_id')
        .eq('id', result.documentId!)
        .single()

      expect(error).toBeNull()
      // All four bucket policies check (storage.foldername(name))[1] against
      // auth.uid(), so the account id has to be the first path segment.
      expect(row?.storage_path.startsWith(`${fixture.userId}/`)).toBe(true)
      expect(row?.account_id).toBe(fixture.userId)
      expect(row?.contact_id).toBe(fixture.contactId)
    } finally {
      await cleanupUploadedObject(result.documentId!)
    }
  })

  it('marks the first passport for a contact primary and the second not', async () => {
    const first = new FormData()
    first.set('kind', 'passport')
    first.set('file', pdfFile('first.pdf'))
    const firstResult = await createIdentityDocument(fixture.contactId, first)
    expect(firstResult.error).toBeNull()

    const second = new FormData()
    second.set('kind', 'passport')
    second.set('file', pdfFile('second.pdf'))
    const secondResult = await createIdentityDocument(fixture.contactId, second)
    expect(secondResult.error).toBeNull()

    try {
      const { data: rows } = await testDb
        .from('identity_documents')
        .select('id, is_primary')
        .in('id', [firstResult.documentId!, secondResult.documentId!])

      const byId = new Map((rows ?? []).map((r) => [r.id, r.is_primary]))
      expect(byId.get(firstResult.documentId!)).toBe(true)
      expect(byId.get(secondResult.documentId!)).toBe(false)
    } finally {
      await cleanupUploadedObject(firstResult.documentId!)
      await cleanupUploadedObject(secondResult.documentId!)
    }
  })
})

// The contact ownership check runs AFTER the upload, not before it, so that a
// contact_id which does not resolve to one this account owns fails the same
// way a row-insert failure does: through the same rollback, deleting the
// object it just wrote. Red first: remove the storage.remove() call in
// createIdentityDocument's rollback() and this test's final assertion fails,
// because the upload above it still succeeds even though the row is never
// created.
describe('createIdentityDocument cleans up the uploaded object when the row is never created', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('does not leave the object in the bucket when contact_id does not resolve', async () => {
    const missingContactId = '00000000-0000-0000-0000-000000000000'

    const fd = new FormData()
    fd.set('kind', 'passport')
    fd.set('file', pdfFile('orphan.pdf'))

    const result = await createIdentityDocument(missingContactId, fd)

    expect(result.error).toBe('Contact not found.')
    expect(result.documentId).toBeNull()

    // No identity_documents row was ever created to look the storage path up
    // from, so list the folder the upload would have used instead: it has to
    // come back empty.
    const { data: objects, error } = await testDb.storage
      .from('identity-documents')
      .list(`${fixture.userId}/${missingContactId}`)

    expect(error).toBeNull()
    expect(objects ?? []).toHaveLength(0)
  })
})

// REE-200 / Brief 45 step 5. syncPassportCache is a private helper, exercised
// only through the actions that call it: create and setPrimaryIdentityDocument
// write the five contacts.passport_* columns forward from the primary
// passport, and deleteIdentityDocument never touches them. That last part is
// the assertion that protects hand-typed data: a TM may have typed a passport
// number long before any scan existed, and deleting the record that happened
// to have last written the cache must not erase it.
//
// Red first: call syncPassportCache from deleteIdentityDocument and the third
// assertion below fails, because deleting the (now primary) second passport
// clears the cache instead of leaving it exactly as setPrimary left it.

function passportFields(fd: FormData, overrides: Record<string, string>) {
  fd.set('kind', 'passport')
  fd.set('document_number', overrides.document_number)
  fd.set('surname', overrides.surname)
  fd.set('given_names', overrides.given_names)
  fd.set('issuing_country', overrides.issuing_country)
  fd.set('expiry_date', overrides.expiry_date)
}

async function passportCache(contactId: string) {
  const { data } = await testDb
    .from('contacts')
    .select('passport_number, passport_surname, passport_first_names, passport_country, passport_expiry')
    .eq('id', contactId)
    .single()
  return data
}

describe('syncPassportCache mirrors the primary passport onto contacts.passport_*', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('writes on create, writes again on set-primary, and is unchanged by delete', async () => {
    const first = new FormData()
    passportFields(first, {
      document_number: '111111111',
      surname: 'OKAFOR',
      given_names: 'MICHAEL JAMES',
      issuing_country: 'GBR',
      expiry_date: '2030-01-01',
    })
    first.set('file', pdfFile('first.pdf'))
    const firstResult = await createIdentityDocument(fixture.contactId, first)
    expect(firstResult.error).toBeNull()

    try {
      const afterFirstCreate = await passportCache(fixture.contactId)
      expect(afterFirstCreate).toEqual({
        passport_number: '111111111',
        passport_surname: 'OKAFOR',
        passport_first_names: 'MICHAEL JAMES',
        passport_country: 'GBR',
        passport_expiry: '2030-01-01',
      })

      const second = new FormData()
      passportFields(second, {
        document_number: '222222222',
        surname: 'REYES',
        given_names: 'ANA SOFIA',
        issuing_country: 'ESP',
        expiry_date: '2031-06-15',
      })
      second.set('file', pdfFile('second.pdf'))
      const secondResult = await createIdentityDocument(fixture.contactId, second)
      expect(secondResult.error).toBeNull()

      try {
        const setPrimaryResult = await setPrimaryIdentityDocument(secondResult.documentId!)
        expect(setPrimaryResult.error).toBeNull()

        const afterSetPrimary = await passportCache(fixture.contactId)
        expect(afterSetPrimary).toEqual({
          passport_number: '222222222',
          passport_surname: 'REYES',
          passport_first_names: 'ANA SOFIA',
          passport_country: 'ESP',
          passport_expiry: '2031-06-15',
        })

        const deleteResult = await deleteIdentityDocument(secondResult.documentId!)
        expect(deleteResult.error).toBeNull()

        const afterDelete = await passportCache(fixture.contactId)
        expect(afterDelete).toEqual(afterSetPrimary)
      } finally {
        await cleanupUploadedObject(secondResult.documentId!)
      }
    } finally {
      await cleanupUploadedObject(firstResult.documentId!)
    }
  })
})
