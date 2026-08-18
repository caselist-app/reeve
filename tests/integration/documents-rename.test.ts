import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { uploadDocument, archiveDocument, renameDocument } from '@/lib/actions/documents'

// REE-255. renameDocument trims and writes title on a document's current row
// only: older-version rows for the same doc_type keep their own title, and an
// empty or whitespace-only title returns an error and leaves the row
// unchanged. This suite needs a running Postgres via Docker
// (vitest.integration.config.mts), which is not available in this sandbox
// (see OPERATIONS.md), so treat this suite's first CI run on this change as
// the actual red/green proof, the same convention documents-archive.test.ts
// follows.

const DOC_TYPE = 'production_rider'

function pdfFile(name: string): File {
  return new File(['%PDF-1.4 test'], name, { type: 'application/pdf' })
}

async function documentRow(documentId: string) {
  const { data, error } = await testDb
    .from('documents')
    .select('id, title, archived_at')
    .eq('id', documentId)
    .single()
  if (error || !data) throw new Error(`could not read document: ${error?.message}`)
  return data
}

describe('renaming a document', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it("renames one document without touching the other, concurrent, document's title", async () => {
    const first = new FormData()
    first.set('doc_type', DOC_TYPE)
    first.set('title', 'Tech Rider v1')
    first.set('file', pdfFile('rider-v1.pdf'))
    const firstResult = await uploadDocument(fixture.tourId, first)
    expect(firstResult.error).toBeNull()

    // REE-299: uploadDocument is additive now, so the first row stays
    // is_current = true after the second upload. Both are current, told
    // apart here only by version, the same way a TM tells them apart by
    // title.
    const { data: firstCurrent } = await testDb
      .from('documents')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('doc_type', DOC_TYPE)
      .eq('version', 1)
      .single()
    if (!firstCurrent) throw new Error('expected the first document row after upload')
    const oldDocumentId = firstCurrent.id

    const second = new FormData()
    second.set('doc_type', DOC_TYPE)
    second.set('title', 'Tech Rider v2')
    second.set('file', pdfFile('rider-v2.pdf'))
    const secondResult = await uploadDocument(fixture.tourId, second)
    expect(secondResult.error).toBeNull()

    const { data: secondCurrent } = await testDb
      .from('documents')
      .select('id')
      .eq('tour_id', fixture.tourId)
      .eq('doc_type', DOC_TYPE)
      .eq('version', 2)
      .single()
    if (!secondCurrent) throw new Error('expected the second document row after re-upload')
    const newDocumentId = secondCurrent.id

    const renameResult = await renameDocument(newDocumentId, '  Full Tech Rider  ')
    expect(renameResult.error).toBeNull()

    const renamedRow = await documentRow(newDocumentId)
    expect(renamedRow.title).toBe('Full Tech Rider')

    const oldRow = await documentRow(oldDocumentId)
    expect(oldRow.title).toBe('Tech Rider v1')
  })

  it('rejects an empty title and leaves the row unchanged', async () => {
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

    const emptyResult = await renameDocument(documentId, '')
    expect(emptyResult.error).toBe('Title is required.')

    const rowAfterEmpty = await documentRow(documentId)
    expect(rowAfterEmpty.title).toBe('Tech Rider')
  })

  it('rejects a whitespace-only title and leaves the row unchanged', async () => {
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

    const whitespaceResult = await renameDocument(documentId, '   ')
    expect(whitespaceResult.error).toBe('Title is required.')

    const rowAfterWhitespace = await documentRow(documentId)
    expect(rowAfterWhitespace.title).toBe('Tech Rider')
  })

  it('renames an already-archived document', async () => {
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

    const archiveResult = await archiveDocument(documentId)
    expect(archiveResult.error).toBeNull()

    const renameResult = await renameDocument(documentId, 'Archived Tech Rider')
    expect(renameResult.error).toBeNull()

    const renamedRow = await documentRow(documentId)
    expect(renamedRow.title).toBe('Archived Tech Rider')
    expect(renamedRow.archived_at).not.toBeNull()
  })
})
