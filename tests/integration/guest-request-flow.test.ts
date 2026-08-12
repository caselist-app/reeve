import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { handleGuestRequest } from '@/lib/comms/guest-request'

// Brief 52, step 6 (REE-133). The /guest flow against a real Postgres, so the
// draft lifecycle, the partial unique index and the cutoff comparison are the
// real ones. Every assertion reads the rows back: a returned outcome proves the
// reply, the row count proves what actually landed on the TM's list.
//
// The fixture's default date is in the past, and the flow only ever resolves the
// NEXT show, so every fixture here is dated a few days out.

function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
}

async function entriesForShow(showId: string) {
  const { data } = await testDb
    .from('guest_list_entries')
    .select('*')
    .eq('show_id', showId)
    .order('created_at', { ascending: true })
  return data ?? []
}

describe('guest request flow', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: futureDate(3) })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('a completed one-liner leaves exactly one requested row with the requester and channel set', async () => {
    const result = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith dave@gmail.com +2',
    })
    expect(result.outcome).toBe('submitted')

    const rows = await entriesForShow(fixture.showId)
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.status).toBe('requested')
    expect(row.request_channel).toBe('telegram')
    expect(row.requested_by_person_id).toBe(fixture.personId)
    expect(row.first_name).toBe('Dave')
    expect(row.last_name).toBe('Smith')
    expect(row.email).toBe('dave@gmail.com')
    // "+2" is Dave plus two.
    expect(row.num_tickets).toBe(3)
  })

  it('an abandoned flow leaves exactly one draft, and it is in no requested or approved count', async () => {
    const result = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith',
    })
    expect(result.outcome).toBe('asking')

    const rows = await entriesForShow(fixture.showId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('draft')

    // The count the TM sees is requested plus approved, so the draft is invisible.
    const counted = rows.filter((r) => r.status === 'requested' || r.status === 'approved')
    expect(counted).toHaveLength(0)
  })

  it('a second /guest for the same show reuses the draft rather than creating a second', async () => {
    await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith',
    })
    // The partial unique index would reject a second draft insert; the flow must
    // resume the first, so this succeeds and the count stays at one.
    const second = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave@gmail.com',
    })
    expect(second.outcome).toBe('asking')

    const drafts = (await entriesForShow(fixture.showId)).filter((r) => r.status === 'draft')
    expect(drafts).toHaveLength(1)
    // The second message answered the email question on the same draft.
    expect(drafts[0].email).toBe('dave@gmail.com')
  })

  it('a request matching an existing name creates no row and names who asked', async () => {
    // An existing request on the list, from the fixture's own crew member.
    const { error: seedError } = await testDb.from('guest_list_entries').insert({
      tour_id: fixture.tourId,
      show_id: fixture.showId,
      first_name: 'Dave',
      last_name: 'Smith',
      request_channel: 'telegram',
      requested_by_person_id: fixture.personId,
      status: 'requested',
    })
    expect(seedError).toBeNull()

    const result = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith dave@gmail.com +2',
    })
    expect(result.outcome).toBe('duplicate')
    expect(result.reply).toContain('already on the list')
    expect(result.reply).toContain('Test Crew')

    // Still just the seeded row: no second entry, no stray draft.
    const rows = await entriesForShow(fixture.showId)
    expect(rows).toHaveLength(1)
  })
})

describe('guest request cutoff, on Pacific/Auckland', () => {
  let fixture: Fixture

  // The cutoff is a stored absolute instant, so whether the list is closed is an
  // instant comparison and is timezone-safe. This fixtures an Auckland tour on a
  // UTC runner precisely so a naive implementation that rebuilt the cutoff from
  // the show's calendar date at UTC midnight would answer a day wrong and fail.
  beforeEach(async () => {
    fixture = await createFixture({ date: futureDate(3), timezone: 'Pacific/Auckland' })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function setCutoff(iso: string | null) {
    const { error } = await testDb
      .from('shows')
      .update({ guest_list_cutoff_at: iso })
      .eq('id', fixture.showId)
    expect(error).toBeNull()
  }

  it('creates no row at all once the cutoff has passed', async () => {
    // Five minutes ago. The same moment is 5 minutes ago in Auckland too; the
    // list is shut in either framing.
    await setCutoff(new Date(Date.now() - 5 * 60_000).toISOString())

    const result = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith dave@gmail.com +2',
    })
    expect(result.outcome).toBe('closed')

    const rows = await entriesForShow(fixture.showId)
    expect(rows).toHaveLength(0)
  })

  it('still takes the request while the cutoff is in the future', async () => {
    // One hour ahead, the other side of the same boundary.
    await setCutoff(new Date(Date.now() + 60 * 60_000).toISOString())

    const result = await handleGuestRequest(testDb, {
      tourId: fixture.tourId,
      personId: fixture.personId,
      channel: 'telegram',
      text: 'dave smith dave@gmail.com +2',
    })
    expect(result.outcome).toBe('submitted')

    const rows = await entriesForShow(fixture.showId)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('requested')
  })
})
