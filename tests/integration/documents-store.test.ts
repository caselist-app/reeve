import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { uploadDocument } from '@/lib/actions/documents'
import { fetchDocumentsPage } from '@/lib/documents/queries'

// REE-3. uploadDocument flips every existing row for a tour's doc_type to
// is_current = false BEFORE inserting the new row, never after: with the
// insert first there is a window where two rows for the same doc_type both
// read is_current = true, which is the exact ambiguity the flag exists to
// rule out. Reordering the action to insert-then-flip is what this suite is
// written to catch; see the note at the bottom of this file for how that was
// proved before the fix landed.

const DOC_TYPE = 'production_rider'

function pdfFile(name: string): File {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

async function currentRows(tourId: string, docType: string) {
  const { data, error } = await testDb
    .from('documents')
    .select('id, version, is_current, storage_path, title')
    .eq('tour_id', tourId)
    .eq('doc_type', docType)
    .order('version', { ascending: true })
  if (error) throw new Error(`could not read documents: ${error.message}`)
  return data
}

describe('uploading a document versions rather than replaces', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('keeps exactly one current row, the newest version, after a second upload', async () => {
    const first = new FormData()
    first.set('doc_type', DOC_TYPE)
    first.set('title', 'Tech Rider v1')
    first.set('file', pdfFile('rider.pdf'))

    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    const second = new FormData()
    second.set('doc_type', DOC_TYPE)
    second.set('title', 'Tech Rider v2')
    second.set('file', pdfFile('rider.pdf'))

    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const rows = await currentRows(fixture.tourId, DOC_TYPE)
    expect(rows).toHaveLength(2)

    const current = rows.filter((r) => r.is_current)
    // The one assertion that fails red against insert-before-flip: the flip's
    // is_current = true filter then also matches the row just inserted, so it
    // flips that one back off too and this reads 0, not 1.
    expect(current).toHaveLength(1)
    expect(current[0].title).toBe('Tech Rider v2')
    expect(current[0].version).toBe(2)

    const firstRow = rows.find((r) => r.version === 1)
    expect(firstRow).toBeDefined()
    expect(firstRow?.is_current).toBe(false)

    expect(current[0].storage_path.startsWith(`${fixture.tourId}/`)).toBe(true)
  })
})

// Red-first, as the ticket requires. Swapping lib/actions/documents.ts to
// insert the new row before running the is_current flip breaks this suite:
// the flip's .eq('is_current', true) filter then also matches the row just
// inserted (it was written with is_current: true), so the flip turns it back
// off along with the old row, and "exactly one current" reads 0. Restoring
// flip-then-insert (the order this file exercises) is what makes it pass.
// This suite needs a running Postgres via Docker (vitest.integration.config.mts),
// which is not available in this sandbox (see OPERATIONS.md); the reorder was
// reasoned through against the query semantics above rather than run, so treat
// this suite's first CI run on this change as the actual red/green proof.

// REE-4. Shares are keyed by document_id, never by doc_type, so a share sent
// against an older version stays attached to that exact row rather than
// leaking into the current version's card. Red first: a query built the
// naive way, joining document_shares to documents by doc_type and reading
// every row for that doc_type (or an embedded `.eq('documents.is_current',
// true)` filter without `!inner`, which CLAUDE.md notes does not actually
// filter anything), would count both versions' shares here and read 2, not
// 1. fetchDocumentsPage never does that: it buckets document_shares by the
// row's own document_id, so looking a card's own document.id up in that
// bucket is what keeps the main log to that exact version by construction.
describe('older versions never leak into the current version\'s share log', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function addShare(documentId: string) {
    const { data, error } = await testDb
      .from('document_shares')
      .insert({
        tour_id: fixture.tourId,
        document_id: documentId,
        recipient_person_id: fixture.personId,
        show_id: fixture.showId,
        channel: 'email',
        share_token: `share-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not add the share: ${error?.message}`)
    return data.id
  }

  it('keeps the main log to the current version and buckets the old one under olderVersions', async () => {
    const first = new FormData()
    first.set('doc_type', DOC_TYPE)
    first.set('title', 'Tech Rider v1')
    first.set('file', pdfFile('rider.pdf'))
    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    const [oldRow] = await currentRows(fixture.tourId, DOC_TYPE)
    await addShare(oldRow.id)

    const second = new FormData()
    second.set('doc_type', DOC_TYPE)
    second.set('title', 'Tech Rider v2')
    second.set('file', pdfFile('rider.pdf'))
    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const rows = await currentRows(fixture.tourId, DOC_TYPE)
    const currentRow = rows.find((r) => r.is_current)
    if (!currentRow) throw new Error('expected a current row after the second upload')
    await addShare(currentRow.id)

    const { shares, olderVersions, error, sharesError, olderVersionsError } = await fetchDocumentsPage(
      testDb,
      fixture.tourId,
      fixture.userId
    )

    expect(error).toBeNull()
    expect(sharesError).toBeNull()
    expect(olderVersionsError).toBeNull()

    // The assertion that fails red against a doc_type-scoped (rather than
    // document_id-scoped) shares query: it would read 2 here, the old
    // version's share included, instead of 1.
    expect(shares[currentRow.id]).toHaveLength(1)
    expect(shares[currentRow.id][0].document_id).toBe(currentRow.id)

    const older = olderVersions[DOC_TYPE]
    expect(older).toHaveLength(1)
    expect(older[0].id).toBe(oldRow.id)
    expect(older[0].version).toBe(1)
    expect(older[0].title).toBe('Tech Rider v1')
    expect(older[0].share_count).toBe(1)
  })
})
