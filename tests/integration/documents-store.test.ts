import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { uploadDocument } from '@/lib/actions/documents'
import { fetchDocumentsPage } from '@/lib/documents/queries'

// REE-299. uploadDocument used to flip every existing row for a tour's
// doc_type to is_current = false before inserting the new row, so a doc_type
// never had more than one current row. That is the opposite of what a TM
// needs when advancing two legs of a tour at once (a UK hospitality rider and
// a Europe hospitality rider, both live). uploadDocument is additive now: it
// never retires an existing row, current or not. archiveDocument is the TM's
// manual retirement step for a document that genuinely is superseded.

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

describe('uploading a document adds rather than replaces', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('keeps both rows current after a second upload of the same doc_type', async () => {
    const first = new FormData()
    first.set('doc_type', DOC_TYPE)
    first.set('title', 'Tech Rider UK')
    first.set('file', pdfFile('rider.pdf'))

    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    const second = new FormData()
    second.set('doc_type', DOC_TYPE)
    second.set('title', 'Tech Rider Europe')
    second.set('file', pdfFile('rider.pdf'))

    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const rows = await currentRows(fixture.tourId, DOC_TYPE)
    expect(rows).toHaveLength(2)

    // Neither upload retires the other: this is the assertion that fails red
    // against the old flip-before-insert behaviour, which would leave only
    // the second row current.
    const current = rows.filter((r) => r.is_current)
    expect(current).toHaveLength(2)
    expect(current.map((r) => r.title).sort()).toEqual(['Tech Rider Europe', 'Tech Rider UK'])

    expect(current[0].storage_path.startsWith(`${fixture.tourId}/`)).toBe(true)
  })
})

// REE-301. General and Marketing (MULTI_CURRENT_DOC_TYPES) are unrelated
// documents that happen to share a doc_type, not versions of one another, so
// they must never collide their storage paths even when the source filename
// is identical. Nothing flips them to not-current: since REE-299, nothing
// in uploadDocument flips any doc_type any more (see the describe block
// above), so this suite only needs to pin the storage-path uniqueness that
// is specific to the multi-current path.
describe('multi-current doc_types never collide on storage_path', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('keeps both General uploads current with distinct storage paths', async () => {
    const first = new FormData()
    first.set('doc_type', 'general')
    first.set('title', 'Stage Plot')
    first.set('file', pdfFile('doc.pdf'))

    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    const second = new FormData()
    second.set('doc_type', 'general')
    second.set('title', 'Parking Map')
    second.set('file', pdfFile('doc.pdf'))

    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const rows = await currentRows(fixture.tourId, 'general')
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.is_current)).toBe(true)

    // The assertion that fails red against the unmodified action: without a
    // random unique segment in the path, both uploads share the same source
    // filename and would resolve to the same storage_path.
    const [stagePlot, parkingMap] = rows
    expect(stagePlot.storage_path).not.toBe(parkingMap.storage_path)
  })
})

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
//
// The old (is_current = false) row here is inserted directly rather than
// produced by a second uploadDocument call: REE-299 removed the only code
// path that ever set is_current = false on a manual upload, so this suite
// seeds the historical shape by hand instead of relying on it.
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
    const { data: oldRow, error: oldRowError } = await testDb
      .from('documents')
      .insert({
        tour_id: fixture.tourId,
        doc_type: DOC_TYPE,
        title: 'Tech Rider v1',
        version: 1,
        storage_path: `${fixture.tourId}/${DOC_TYPE}/v1_rider.pdf`,
        is_current: false,
      })
      .select('id')
      .single()
    if (oldRowError || !oldRow) throw new Error(`could not seed the old row: ${oldRowError?.message}`)
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
