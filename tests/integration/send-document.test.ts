import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, createSecondTour, destroyFixture, type Fixture } from './fixture'

// send-rider-email and advance-reminder are Trigger.dev tasks. sendDocument
// awaits their .trigger() calls, which need TRIGGER_SECRET_KEY and a running
// Trigger.dev, neither of which exists here. Mocked so the action reaches its
// own return rather than throwing on the enqueue, same pattern as
// create-show-revalidate.test.ts.
vi.mock('@/trigger/jobs/send-rider-email', () => ({
  sendRiderEmailJob: { trigger: vi.fn() },
}))
vi.mock('@/trigger/jobs/advance-reminder', () => ({
  advanceReminderJob: { trigger: vi.fn() },
}))

import { sendDocument } from '@/lib/actions/documents'
import { sendRiderEmailJob } from '@/trigger/jobs/send-rider-email'
import { advanceReminderJob } from '@/trigger/jobs/advance-reminder'

// Every recipient needs a contact_email, since sendDocument rejects a
// recipient with none before it inserts anything. contacts seeded by
// createFixture / createSecondTour have no email, so every recipient used
// here is created directly with one.
async function createEmailPerson(tourId: string, accountId: string, name: string, email: string) {
  const { data: contact, error: contactError } = await testDb
    .from('contacts')
    .insert({ account_id: accountId, name, contact_email: email })
    .select('id')
    .single()
  if (contactError || !contact) throw new Error(`could not create contact: ${contactError?.message}`)

  const { data: person, error: personError } = await testDb
    .from('people')
    .insert({ tour_id: tourId, contact_id: contact.id, person_type: 'crew' })
    .select('id')
    .single()
  if (personError || !person) throw new Error(`could not create person: ${personError?.message}`)

  return person.id as string
}

async function createDocument(tourId: string, title = 'Stage Plot') {
  const { data: doc, error } = await testDb
    .from('documents')
    .insert({
      tour_id: tourId,
      title,
      doc_type: 'rider',
      storage_path: `${tourId}/${title}.pdf`,
    })
    .select('id')
    .single()
  if (error || !doc) throw new Error(`could not create document: ${error?.message}`)
  return doc.id as string
}

describe('sendDocument', () => {
  let fixture: Fixture
  let documentId: string

  beforeEach(async () => {
    fixture = await createFixture()
    documentId = await createDocument(fixture.tourId)
    vi.mocked(sendRiderEmailJob.trigger).mockClear()
    vi.mocked(advanceReminderJob.trigger).mockClear()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('rejects an empty recipient list and inserts nothing', async () => {
    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientPersonIds: [],
      showId: fixture.showId,
    })

    expect(result.error).toBeTruthy()

    const { data } = await testDb
      .from('document_shares')
      .select('id')
      .eq('tour_id', fixture.tourId)
    expect(data ?? []).toHaveLength(0)
  })

  it('rejects a recipient from another tour', async () => {
    const other = await createSecondTour(fixture)
    const otherPersonId = await createEmailPerson(
      other.tourId,
      fixture.userId,
      'Other Crew',
      'other-crew@example.test'
    )
    const validPersonId = await createEmailPerson(
      fixture.tourId,
      fixture.userId,
      'Valid Crew',
      'valid-crew@example.test'
    )

    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientPersonIds: [validPersonId, otherPersonId],
      showId: fixture.showId,
    })

    expect(result.error).toBeTruthy()

    const { data } = await testDb
      .from('document_shares')
      .select('id')
      .eq('tour_id', fixture.tourId)
    expect(data ?? []).toHaveLength(0)
  })

  it('sends to three recipients with three distinct tokens', async () => {
    const personIds = await Promise.all([
      createEmailPerson(fixture.tourId, fixture.userId, 'Crew One', 'crew-one@example.test'),
      createEmailPerson(fixture.tourId, fixture.userId, 'Crew Two', 'crew-two@example.test'),
      createEmailPerson(fixture.tourId, fixture.userId, 'Crew Three', 'crew-three@example.test'),
    ])

    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientPersonIds: personIds,
      showId: fixture.showId,
    })

    expect(result.error).toBeNull()

    const { data } = await testDb
      .from('document_shares')
      .select('id, recipient_person_id, share_token, show_id')
      .eq('tour_id', fixture.tourId)

    expect(data ?? []).toHaveLength(3)
    expect(new Set((data ?? []).map((row) => row.share_token)).size).toBe(3)
    expect(new Set((data ?? []).map((row) => row.recipient_person_id))).toEqual(new Set(personIds))
    expect(sendRiderEmailJob.trigger).toHaveBeenCalledTimes(3)
    // showId was set, so reminders are scheduled for every recipient.
    expect(advanceReminderJob.trigger).toHaveBeenCalledTimes(6)
  })

  it('inserts a null show_id and schedules no reminders when no show is given', async () => {
    const personId = await createEmailPerson(
      fixture.tourId,
      fixture.userId,
      'Crew One',
      'crew-one@example.test'
    )

    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientPersonIds: [personId],
    })

    expect(result.error).toBeNull()

    const { data } = await testDb
      .from('document_shares')
      .select('show_id')
      .eq('tour_id', fixture.tourId)
      .single()

    expect(data?.show_id).toBeNull()
    expect(sendRiderEmailJob.trigger).toHaveBeenCalledTimes(1)
    expect(advanceReminderJob.trigger).not.toHaveBeenCalled()
  })
})
