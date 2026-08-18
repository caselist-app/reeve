import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { uploadDocument, getDocumentViewUrl } from '@/lib/actions/documents'

// REE-302. getDocumentViewUrl signs a short-lived URL for "View" on a
// document card, for any doc_type. It carries no explicit ownership check
// beyond the .single() read: RLS (owns_tour(tour_id) on documents) is what
// is meant to block a documentId from another account's tour.
//
// setup.ts mocks both createClient and createAdminClient to the same
// service-role testDb client, so RLS is never enforced here (see the header
// comment on tests/e2e/access.spec.ts and tests/integration/test-db.ts):
// a cross-account call made through this suite's mocked client would resolve
// a signed URL regardless of whether an ownership check exists, proving
// nothing about RLS either way. So this file covers only the positive path;
// the cross-account isolation proof lives in tests/e2e/access.spec.ts
// ("document view isolation"), which drives the action through a real,
// cookie-carrying session for a second account, the same split
// identity-documents.test.ts and access.spec.ts already use for
// signIdentityDocumentUrl.

const DOC_TYPE = 'production_rider'

function pdfFile(name: string): File {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

describe('getDocumentViewUrl signs a document for viewing', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('resolves a signed URL for a document the caller owns', async () => {
    const form = new FormData()
    form.set('doc_type', DOC_TYPE)
    form.set('title', 'Tech Rider')
    form.set('file', pdfFile('rider.pdf'))
    const uploadResult = await uploadDocument(fixture.tourId, form)
    expect(uploadResult.error).toBeNull()

    const { data: current } = await testDb
      .from('documents')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('doc_type', DOC_TYPE)
      .eq('is_current', true)
      .single()
    if (!current) throw new Error('expected a current document row after upload')

    const result = await getDocumentViewUrl(current.id)

    expect(result.error).toBeNull()
    expect(typeof result.url).toBe('string')
    expect(result.url).not.toBeNull()
  })

  it('returns an error for a documentId that does not exist', async () => {
    const missingDocumentId = '00000000-0000-0000-0000-000000000000'

    const result = await getDocumentViewUrl(missingDocumentId)

    expect(result.url).toBeNull()
    expect(result.error).not.toBeNull()
  })
})
