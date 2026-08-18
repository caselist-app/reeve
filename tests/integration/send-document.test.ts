import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

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

// REE-283: recipients are freeform email addresses, not roster people, so
// these tests never need to seed a person or contact for a recipient.

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
      recipientEmails: [],
      showId: fixture.showId,
    })

    expect(result.error).toBeTruthy()

    const { data } = await testDb
      .from('document_shares')
      .select('id')
      .eq('tour_id', fixture.tourId)
    expect(data ?? []).toHaveLength(0)
  })

  it('rejects a malformed email and inserts nothing', async () => {
    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientEmails: ['valid-crew@example.test', 'not-an-email'],
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
    const emails = ['crew-one@example.test', 'crew-two@example.test', 'crew-three@example.test']

    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientEmails: emails,
      showId: fixture.showId,
    })

    expect(result.error).toBeNull()

    const { data } = await testDb
      .from('document_shares')
      .select('id, recipient_email, recipient_person_id, share_token, show_id')
      .eq('tour_id', fixture.tourId)

    expect(data ?? []).toHaveLength(3)
    expect(new Set((data ?? []).map((row) => row.share_token)).size).toBe(3)
    expect(new Set((data ?? []).map((row) => row.recipient_email))).toEqual(new Set(emails))
    expect((data ?? []).every((row) => row.recipient_person_id === null)).toBe(true)
    expect(sendRiderEmailJob.trigger).toHaveBeenCalledTimes(3)
    // showId was set, so reminders are scheduled for every recipient.
    expect(advanceReminderJob.trigger).toHaveBeenCalledTimes(6)
  })

  it('dedupes a repeated recipient into a single share', async () => {
    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientEmails: ['crew@example.test', 'Crew@example.test', ' crew@example.test '],
      showId: fixture.showId,
    })

    expect(result.error).toBeNull()

    const { data } = await testDb
      .from('document_shares')
      .select('id')
      .eq('tour_id', fixture.tourId)
    expect(data ?? []).toHaveLength(1)
    expect(sendRiderEmailJob.trigger).toHaveBeenCalledTimes(1)
  })

  it('inserts a null show_id and schedules no reminders when no show is given', async () => {
    const result = await sendDocument({
      tourId: fixture.tourId,
      documentId,
      recipientEmails: ['crew-one@example.test'],
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
