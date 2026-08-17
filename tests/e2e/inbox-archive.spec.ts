import { expect, test } from '@playwright/test'
import { readSeed } from './seed'
import { testDb } from '../integration/test-db'

// The archive toggle (REE-232, brief 58). ?view=archive is a read-only look
// back at what has been resolved, and the fourth assertion below is the actual
// bug this brief exists for: discardExtraction sets extraction_status to
// 'failed', the same value a genuine extraction failure leaves behind, so
// ExtractionItem's old `resolved = subject.status === 'confirmed'` read a
// discarded extraction as an unresolved failure and rendered a live Discard
// button on a row that had already been cleared.
//
// All three seeded rows live on their own dedicated show/tour_date, not
// seed.a.showId: guest-list.spec.ts asserts that show's guest list starts
// empty, and adding an approved entry there would break it. Cleanup runs in
// afterEach regardless of pass/fail, because revalidate.spec.ts's Inbox badge
// test asserts an exact open count of 1 from its own seed alone ("No count in
// the app touches attention_items except this spec") and this file sorts
// before it alphabetically in the single-worker run.

const inboxItemDate = '2026-06-25'

let tourDateId: string
let showId: string
let openEntryId: string
let openItemId: string
let approvedEntryId: string
let approvedItemId: string
let forwardedEmailId: string
let discardedItemId: string

test.beforeEach(async () => {
  const seed = readSeed()

  const { data: tourDate, error: tourDateError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: seed.a.tourId, date: inboxItemDate, day_type: 'show' })
    .select('id')
    .single()
  if (tourDateError || !tourDate) throw new Error(`could not seed tour_date: ${tourDateError?.message}`)
  tourDateId = tourDate.id

  const { data: show, error: showError } = await testDb
    .from('shows')
    .insert({
      tour_id: seed.a.tourId,
      tour_date_id: tourDateId,
      date: inboxItemDate,
      venue_name: 'Archive Test Venue',
    })
    .select('id')
    .single()
  if (showError || !show) throw new Error(`could not seed show: ${showError?.message}`)
  showId = show.id

  // The open item: still requested, attention item unresolved.
  const { data: openEntry, error: openEntryError } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: seed.a.tourId,
      show_id: showId,
      first_name: 'Open',
      last_name: 'Request',
      num_tickets: 1,
      request_channel: 'app',
      requested_by_person_id: seed.a.personId,
      status: 'requested',
    })
    .select('id')
    .single()
  if (openEntryError || !openEntry) throw new Error(`could not seed open entry: ${openEntryError?.message}`)
  openEntryId = openEntry.id

  const { data: openItem, error: openItemError } = await testDb
    .from('attention_items')
    .insert({
      tour_id: seed.a.tourId,
      kind: 'guest_request',
      title: 'Guest request: Open Request for Archive Test Venue',
      related_table: 'guest_list_entries',
      related_id: openEntryId,
    })
    .select('id')
    .single()
  if (openItemError || !openItem) throw new Error(`could not seed open item: ${openItemError?.message}`)
  openItemId = openItem.id

  // The resolved (approved) guest request. Resolved most recently of the two
  // archived rows, so the archive's "most-recently-resolved first" order puts
  // it above the discarded extraction.
  const { data: approvedEntry, error: approvedEntryError } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: seed.a.tourId,
      show_id: showId,
      first_name: 'Approved',
      last_name: 'Request',
      num_tickets: 1,
      request_channel: 'app',
      requested_by_person_id: seed.a.personId,
      status: 'approved',
    })
    .select('id')
    .single()
  if (approvedEntryError || !approvedEntry) {
    throw new Error(`could not seed approved entry: ${approvedEntryError?.message}`)
  }
  approvedEntryId = approvedEntry.id

  const { data: approvedItem, error: approvedItemError } = await testDb
    .from('attention_items')
    .insert({
      tour_id: seed.a.tourId,
      kind: 'guest_request',
      title: 'Guest request: Approved Request for Archive Test Venue',
      related_table: 'guest_list_entries',
      related_id: approvedEntryId,
      resolved_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (approvedItemError || !approvedItem) {
    throw new Error(`could not seed approved item: ${approvedItemError?.message}`)
  }
  approvedItemId = approvedItem.id

  // The resolved (discarded) extraction. discardExtraction sets
  // extraction_status to 'failed', the same value a genuine failure leaves,
  // which is exactly the ambiguity this brief fixes.
  const { data: forwarded, error: forwardedError } = await testDb
    .from('forwarded_emails')
    .insert({
      tour_id: seed.a.tourId,
      from_address: 'promoter@example.test',
      subject: 'Advance details',
      body_text: 'Not relevant to this tour.',
      extraction_status: 'failed',
    })
    .select('id')
    .single()
  if (forwardedError || !forwarded) throw new Error(`could not seed forwarded email: ${forwardedError?.message}`)
  forwardedEmailId = forwarded.id

  const { data: discardedItem, error: discardedItemError } = await testDb
    .from('attention_items')
    .insert({
      tour_id: seed.a.tourId,
      kind: 'email_extraction',
      title: 'Advance details',
      related_table: 'forwarded_emails',
      related_id: forwardedEmailId,
      // A minute before the approved guest request, so ordering is
      // unambiguous rather than resting on two now() calls landing apart.
      resolved_at: new Date(Date.now() - 60_000).toISOString(),
    })
    .select('id')
    .single()
  if (discardedItemError || !discardedItem) {
    throw new Error(`could not seed discarded item: ${discardedItemError?.message}`)
  }
  discardedItemId = discardedItem.id
})

test.afterEach(async () => {
  // Children first: attention_items and guest_list_entries/forwarded_emails
  // have no FK to each other, but the show and tour_date cascade the entries.
  await testDb.from('attention_items').delete().in('id', [openItemId, approvedItemId, discardedItemId])
  await testDb.from('forwarded_emails').delete().eq('id', forwardedEmailId)
  await testDb.from('shows').delete().eq('id', showId)
  await testDb.from('tour_dates').delete().eq('id', tourDateId)
})

test('the archive toggle separates open from resolved, and a discarded extraction reads as discarded', async ({
  page,
}) => {
  await page.goto('/inbox')

  const openRow = page.getByRole('link', { name: /Guest request: Open Request/ })
  const approvedRow = page.getByRole('link', { name: /Guest request: Approved Request/ })
  const discardedRow = page.getByRole('link', { name: /Advance details/ })

  await expect(openRow).toBeVisible()
  await expect(approvedRow).toBeHidden()
  await expect(discardedRow).toBeHidden()

  const archiveLink = page.getByRole('link', { name: 'View archive' })
  await expect(archiveLink).toBeVisible()
  await archiveLink.click()
  await expect(page).toHaveURL('/inbox?view=archive')

  await expect(openRow).toBeHidden()
  await expect(approvedRow).toBeVisible()
  await expect(discardedRow).toBeVisible()

  // Most-recently-resolved first: the approved guest request's row precedes
  // the discarded extraction's row in document order.
  const rowOrder = await page.locator('a[href^="/inbox/"]').allTextContents()
  const approvedIndex = rowOrder.findIndex((text) => text.includes('Approved Request'))
  const discardedIndex = rowOrder.findIndex((text) => text.includes('Advance details'))
  expect(approvedIndex).toBeGreaterThanOrEqual(0)
  expect(discardedIndex).toBeGreaterThanOrEqual(0)
  expect(approvedIndex).toBeLessThan(discardedIndex)

  await expect(page.getByRole('link', { name: 'Back to inbox' })).toBeVisible()

  await approvedRow.click()
  await expect(page).toHaveURL(`/inbox/${approvedItemId}`)
  await expect(page.getByText('This request was already approved.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Approve' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Decline' })).toBeHidden()

  await page.goto('/inbox?view=archive')
  await discardedRow.click()
  await expect(page).toHaveURL(`/inbox/${discardedItemId}`)
  await expect(page.getByText('This extraction was discarded.')).toBeVisible()
  await expect(page.getByText(/Extraction failed/)).toBeHidden()
  await expect(page.getByRole('button', { name: 'Review rows' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Discard' })).toBeHidden()
})
