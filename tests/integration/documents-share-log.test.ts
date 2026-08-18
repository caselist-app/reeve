import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { fetchDocumentsPage } from '@/lib/documents/queries'

// REE-2. people has had no `name` column since Brief 20 (crew_roster):
// identity moved onto contacts, and the column was dropped outright, not
// deprecated. A share log select written against `people(name)` is therefore
// rejected by PostgREST rather than quietly returning a null or empty
// recipient, which is exactly the failure mode this file guards: the old
// brief would have shipped `people(name)`, and the fix is the two-hop embed,
// `people(role, contacts(name, contact_email))`, pinned below.
//
// The second thing this guards is the null-show_id case. A document can be
// shared at the tour level rather than against one show (document_shares.
// show_id is nullable for exactly this), and a query written with an inner
// join anywhere on the show side would silently drop that row instead of
// returning it with show_id null.

const DATE = '2030-07-01'

describe('the documents page share log', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function addDocument(title = 'Tech Rider') {
    const { data, error } = await testDb
      .from('documents')
      .insert({
        tour_id: fixture.tourId,
        doc_type: 'production_rider',
        title,
        storage_path: `${fixture.tourId}/${title}.pdf`,
      })
      .select('id')
      .single()
    // Thrown rather than asserted: a test that continues past a failed setup
    // passes or fails for a reason that has nothing to do with what it checks.
    if (error || !data) throw new Error(`could not add the document: ${error?.message}`)
    return data.id
  }

  async function addShare(
    documentId: string,
    opts: { showId?: string | null; reminderCount?: number } = {}
  ) {
    const { data, error } = await testDb
      .from('document_shares')
      .insert({
        tour_id: fixture.tourId,
        document_id: documentId,
        recipient_person_id: fixture.personId,
        show_id: opts.showId ?? null,
        channel: 'email',
        share_token: `share-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        sent_at: new Date().toISOString(),
        reminder_count: opts.reminderCount ?? 0,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not add the share: ${error?.message}`)
    return data.id
  }

  it('reads the recipient name from contacts, not people', async () => {
    const documentId = await addDocument()
    await addShare(documentId, { showId: fixture.showId })

    const { shares, error } = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)

    expect(error).toBeNull()
    expect(shares[documentId]).toHaveLength(1)
    expect(shares[documentId][0].recipient_name).toBe('Test Crew')
  })

  it('returns a share with no show_id rather than filtering it out', async () => {
    const documentId = await addDocument()
    await addShare(documentId, { showId: fixture.showId })
    await addShare(documentId, { showId: null })

    const { shares, error } = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)

    expect(error).toBeNull()
    expect(shares[documentId]).toHaveLength(2)

    const tourShare = shares[documentId].find((s) => s.show_id === null)
    expect(tourShare).toBeDefined()
    expect(tourShare?.recipient_name).toBe('Test Crew')
    expect(tourShare?.show_label).toBeNull()

    const showShare = shares[documentId].find((s) => s.show_id === fixture.showId)
    expect(showShare).toBeDefined()
  })

  it('carries reminder_count through for the "reminder sent" suffix', async () => {
    const documentId = await addDocument()
    await addShare(documentId, { showId: fixture.showId, reminderCount: 2 })

    const { shares } = await fetchDocumentsPage(testDb, fixture.tourId, fixture.userId)

    expect(shares[documentId][0].reminder_count).toBe(2)
  })
})
