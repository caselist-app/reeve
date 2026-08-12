import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import type { ExtractionProposal } from '@/lib/ai/extract'

// REE-153: extraction becomes a producer. runExtraction writes the Inbox row
// for both terminal extraction states, and confirmExtraction/discardExtraction
// resolve it only after their own write has actually landed (rule 3 of brief
// 53, lib/actions/inbox.ts's resolveAttentionItem).
//
// Stub only the extraction adapter (the AI boundary, CLAUDE.md "AI is a thin
// intelligent layer"), never the Supabase client: runExtraction takes bodyText
// directly, so it never touches the Resend fetch trigger/jobs/extract-forward.ts
// makes around it, and everything below the adapter is a real Postgres write.

vi.mock('@/lib/ai/extract', () => ({
  extractEmailForward: vi.fn(),
}))

import { extractEmailForward } from '@/lib/ai/extract'
import { runExtraction } from '@/trigger/jobs/extract-forward'
import { confirmExtraction, discardExtraction } from '@/lib/actions/extractions'
import type { ExtractionKeep } from '@/lib/validators/extraction'

const mockedExtract = vi.mocked(extractEmailForward)

const EMPTY_PROPOSAL: ExtractionProposal = { shows: [], transport_segments: [], hotel_stays: [] }
const NO_KEEP: ExtractionKeep = { shows: [], transport_segments: [], hotel_stays: [] }

async function seedForwardedEmail(tourId: string, subject = 'Advance details') {
  const { data, error } = await testDb
    .from('forwarded_emails')
    .insert({ tour_id: tourId, subject })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed forwarded_emails: ${error?.message}`)
  return data.id
}

async function attentionForForward(forwardedEmailId: string) {
  const { data } = await testDb
    .from('attention_items')
    .select('*')
    .eq('related_table', 'forwarded_emails')
    .eq('related_id', forwardedEmailId)
  return data ?? []
}

describe('extraction as a producer', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    mockedExtract.mockReset()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('reaching extracted writes exactly one open attention item pointing at the email', async () => {
    mockedExtract.mockResolvedValue(EMPTY_PROPOSAL)
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)

    const result = await runExtraction(testDb, {
      forwardedEmailId,
      tourId: fixture.tourId,
      subject: 'Advance details',
      bodyText: 'Load-in 10:00, curfew 23:00.',
    })
    expect(result.status).toBe('extracted')

    const { data: forwarded } = await testDb
      .from('forwarded_emails')
      .select('extraction_status')
      .eq('id', forwardedEmailId)
      .single()
    expect(forwarded?.extraction_status).toBe('extracted')

    const items = await attentionForForward(forwardedEmailId)
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('email_extraction')
    expect(items[0].related_table).toBe('forwarded_emails')
    expect(items[0].related_id).toBe(forwardedEmailId)
    expect(items[0].resolved_at).toBeNull()
  })

  it('reaching failed writes exactly one attention item at severity 2', async () => {
    mockedExtract.mockRejectedValue(new Error('the model call failed'))
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)

    const result = await runExtraction(testDb, {
      forwardedEmailId,
      tourId: fixture.tourId,
      subject: 'Advance details',
      bodyText: 'Load-in 10:00, curfew 23:00.',
    })
    expect(result.status).toBe('failed')

    const { data: forwarded } = await testDb
      .from('forwarded_emails')
      .select('extraction_status')
      .eq('id', forwardedEmailId)
      .single()
    expect(forwarded?.extraction_status).toBe('failed')

    const items = await attentionForForward(forwardedEmailId)
    expect(items).toHaveLength(1)
    expect(items[0].severity).toBe(2)
    expect(items[0].resolved_at).toBeNull()
  })

  it('confirming resolves the open item', async () => {
    mockedExtract.mockResolvedValue(EMPTY_PROPOSAL)
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)
    await runExtraction(testDb, {
      forwardedEmailId,
      tourId: fixture.tourId,
      subject: 'Advance details',
      bodyText: 'Load-in 10:00, curfew 23:00.',
    })
    expect((await attentionForForward(forwardedEmailId))[0].resolved_at).toBeNull()

    const result = await confirmExtraction(forwardedEmailId, NO_KEEP)
    expect(result.error).toBeNull()

    const items = await attentionForForward(forwardedEmailId)
    expect(items).toHaveLength(1)
    expect(items[0].resolved_at).not.toBeNull()
  })

  it('discarding resolves the open item', async () => {
    mockedExtract.mockRejectedValue(new Error('the model call failed'))
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)
    await runExtraction(testDb, {
      forwardedEmailId,
      tourId: fixture.tourId,
      subject: 'Advance details',
      bodyText: '',
    })
    expect((await attentionForForward(forwardedEmailId))[0].resolved_at).toBeNull()

    const result = await discardExtraction(forwardedEmailId)
    expect(result.error).toBeNull()

    const items = await attentionForForward(forwardedEmailId)
    expect(items).toHaveLength(1)
    expect(items[0].resolved_at).not.toBeNull()
  })

  it('leaves resolved_at null and the item in the queue when confirm throws part way', async () => {
    mockedExtract.mockResolvedValue(EMPTY_PROPOSAL)
    const forwardedEmailId = await seedForwardedEmail(fixture.tourId)
    await runExtraction(testDb, {
      forwardedEmailId,
      tourId: fixture.tourId,
      subject: 'Advance details',
      bodyText: 'Load-in 10:00, curfew 23:00.',
    })

    // A malformed row, not a malformed argument: confirmExtraction reads
    // proposed_rows itself now (REE-154), so the way to reach a genuine
    // exception after the optimistic lock is to plant one in the row the TM
    // kept. Index 0 is in range, so narrowExtractionProposal picks it
    // cleanly; confirmExtraction only breaks once it tries `show.date` on the
    // null it kept, deep in the shows loop, well after the lock write.
    await testDb
      .from('forwarded_emails')
      .update({ proposed_rows: { shows: [null], transport_segments: [], hotel_stays: [] } })
      .eq('id', forwardedEmailId)

    const keep: ExtractionKeep = { shows: [0], transport_segments: [], hotel_stays: [] }

    await expect(confirmExtraction(forwardedEmailId, keep)).rejects.toThrow()

    const items = await attentionForForward(forwardedEmailId)
    expect(items).toHaveLength(1)
    expect(items[0].resolved_at).toBeNull()
  })
})
