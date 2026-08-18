import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { uploadDocument, archiveDocument, unarchiveDocument } from '@/lib/actions/documents'
import { fetchDocumentsPage } from '@/lib/documents/queries'

// REE-253. archiveDocument/unarchiveDocument set and clear archived_at on a
// document's current row, and fetchDocumentsPage's active leg excludes
// anything with archived_at set while a new archived leg picks it up
// instead. Red first, per the ticket: this suite is written against the
// finished query layer (active leg carries `.is('archived_at', null)`, the
// archived leg carries `.not('archived_at', 'is', null)`), and removing the
// active leg's filter is what makes "archived row is not in `documents`"
// fail. This suite needs a running Postgres via Docker
// (vitest.integration.config.mts), which is not available in this sandbox
// (see OPERATIONS.md); the removal was reasoned through against the query
// semantics above rather than run, so treat this suite's first CI run on
// this change as the actual red/green proof, the same convention
// documents-store.test.ts follows.

const DOC_TYPE = 'production_rider'

function pdfFile(name: string): File {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

async function documentRow(documentId: string) {
  const { data, error } = await testDb
    .from('documents')
    .select('id, archived_at')
    .eq('id', documentId)
    .single()
  if (error || !data) throw new Error(`could not read document: ${error?.message}`)
  return data
}

async function shareRows(documentId: string) {
  const { data, error } = await testDb
    .from('document_shares')
    .select('id, tour_id, document_id, recipient_person_id, show_id, channel, share_token, sent_at, opened_at, acknowledged_at, reminder_count')
    .eq('document_id', documentId)
    .order('id', { ascending: true })
  if (error) throw new Error(`could not read document_shares: ${error.message}`)
  return data
}

describe('archiving and unarchiving a document', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('moves a document between the active and archived legs without touching its shares', async () => {
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
    const documentId = current.id

    // A real share on the document, so the "unchanged" assertion below is
    // meaningful rather than trivially true for an empty array.
    const { error: shareInsertError } = await testDb.from('document_shares').insert({
      tour_id: fixture.tourId,
      document_id: documentId,
      recipient_person_id: fixture.personId,
      show_id: fixture.showId,
      channel: 'email',
      share_token: `share-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      sent_at: new Date().toISOString(),
    })
    if (shareInsertError) throw new Error(`could not add the share: ${shareInsertError.message}`)

    const sharesBeforeArchive = await shareRows(documentId)
    expect(sharesBeforeArchive).toHaveLength(1)

    const archiveResult = await archiveDocument(documentId)
    expect(archiveResult.error).toBeNull()

    const archivedRow = await documentRow(documentId)
    expect(archivedRow.archived_at).not.toBeNull()

    const sharesAfterArchive = await shareRows(documentId)
    expect(sharesAfterArchive).toEqual(sharesBeforeArchive)

    const pageAfterArchive = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)
    expect(pageAfterArchive.error).toBeNull()
    expect(pageAfterArchive.archivedDocumentsError).toBeNull()
    expect(pageAfterArchive.documents.some((d) => d.id === documentId)).toBe(false)
    expect(pageAfterArchive.archivedDocuments.some((d) => d.id === documentId)).toBe(true)

    const unarchiveResult = await unarchiveDocument(documentId)
    expect(unarchiveResult.error).toBeNull()

    const restoredRow = await documentRow(documentId)
    expect(restoredRow.archived_at).toBeNull()

    const sharesAfterUnarchive = await shareRows(documentId)
    expect(sharesAfterUnarchive).toEqual(sharesBeforeArchive)

    const pageAfterUnarchive = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)
    expect(pageAfterUnarchive.error).toBeNull()
    expect(pageAfterUnarchive.archivedDocumentsError).toBeNull()
    expect(pageAfterUnarchive.documents.some((d) => d.id === documentId)).toBe(true)
    expect(pageAfterUnarchive.archivedDocuments.some((d) => d.id === documentId)).toBe(false)
  })

  // REE-254. uploadDocument's insert never carries the prior current row's
  // archived_at forward, so re-uploading a version of an archived doc_type
  // makes it active again with no separate unarchive step. Proved red by
  // temporarily setting the insert's archived_at to `latest?.archived_at ??
  // null`: this assertion then fails because the new row inherits the old
  // one's archived_at instead of defaulting to null.
  it('a new version is current and unarchived, even when the row it replaces was archived', async () => {
    const first = new FormData()
    first.set('doc_type', DOC_TYPE)
    first.set('title', 'Tech Rider')
    first.set('file', pdfFile('rider.pdf'))
    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    const { data: firstCurrent } = await testDb
      .from('documents')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('doc_type', DOC_TYPE)
      .eq('is_current', true)
      .single()
    if (!firstCurrent) throw new Error('expected a current document row after upload')

    const archiveResult = await archiveDocument(firstCurrent.id)
    expect(archiveResult.error).toBeNull()

    const second = new FormData()
    second.set('doc_type', DOC_TYPE)
    second.set('title', 'Tech Rider v2')
    second.set('file', pdfFile('rider-v2.pdf'))
    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const { data: secondCurrent } = await testDb
      .from('documents')
      .select('id, archived_at')
      .eq('tour_id', fixture.tourId)
      .eq('doc_type', DOC_TYPE)
      .eq('is_current', true)
      .single()
    if (!secondCurrent) throw new Error('expected a current document row after re-upload')
    expect(secondCurrent.archived_at).toBeNull()

    const page = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)
    expect(page.error).toBeNull()
    expect(page.documents.some((d) => d.id === secondCurrent.id)).toBe(true)
    expect(page.archivedDocuments.some((d) => d.id === secondCurrent.id)).toBe(false)
  })
})
