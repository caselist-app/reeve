import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import {
  sendGuestConfirmationEmails,
  type ConfirmationSender,
} from '@/lib/guest-list/send-confirmations'
import { guestConfirmationLines } from '@/lib/comms/templates/guest-confirmation'

// Brief 52, step 9 (REE-136). The confirmation-email send, tested against a real
// Postgres so the notified_at write, the approved/has-email/not-yet-notified
// filter and the doors day_item lookup are the real ones.
//
// The send adapter is injected, so a throwing stub proves the ordering: an
// entry whose send throws keeps notified_at null and is picked up again next
// time. A mock would not exercise the SQL; the point is that it does.

// The action enqueues through the job task. Mock it so the count test does not
// reach Trigger.dev; the send itself is exercised through the core directly.
vi.mock('@/trigger/jobs/guest-confirmation-send', () => ({
  guestConfirmationSendJob: { trigger: vi.fn() },
}))

// Imported after the mock declaration for clarity; vi.mock is hoisted regardless.
import { sendGuestConfirmations } from '@/lib/actions/guest-list'

function capturingSender() {
  const calls: Array<{ to: string; subject: string; html: string; artistSlug: string | null }> = []
  const send: ConfirmationSender = async (email) => {
    calls.push(email)
  }
  return { calls, send }
}

const throwingSender: ConfirmationSender = async () => {
  throw new Error('the mail server is down')
}

async function seedApproved(
  fixture: Fixture,
  overrides: Partial<{ email: string | null; first_name: string; last_name: string; num_tickets: number; pass_type: string }> = {},
): Promise<string> {
  const { data, error } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: fixture.tourId,
      show_id: fixture.showId,
      request_channel: 'app',
      status: 'approved',
      first_name: overrides.first_name ?? 'Dave',
      last_name: overrides.last_name ?? 'Smith',
      email: overrides.email === undefined ? 'dave@example.test' : overrides.email,
      num_tickets: overrides.num_tickets ?? 2,
      pass_type: overrides.pass_type ?? 'ticket',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`could not seed approved entry: ${error?.message}`)
  return data.id
}

async function readNotifiedAt(entryId: string): Promise<string | null> {
  const { data } = await testDb
    .from('guest_list_entries')
    .select('notified_at')
    .eq('id', entryId)
    .single()
  return data?.notified_at ?? null
}

describe('guest confirmation send', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('writes notified_at only after the send returns', async () => {
    const entryId = await seedApproved(fixture)
    const { calls, send } = capturingSender()

    const result = await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send })

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe('dave@example.test')
    expect(await readNotifiedAt(entryId)).not.toBeNull()
  })

  it('leaves notified_at null and the entry re-sendable when the send throws', async () => {
    const entryId = await seedApproved(fixture)

    const failed = await sendGuestConfirmationEmails(testDb, {
      showId: fixture.showId,
      send: throwingSender,
    })

    expect(failed).toEqual({ sent: 0, failed: 1 })
    // The send threw, so the entry was never marked told.
    expect(await readNotifiedAt(entryId)).toBeNull()

    // And because notified_at is still null, a later send picks it up again.
    const { calls, send } = capturingSender()
    const retried = await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send })

    expect(retried).toEqual({ sent: 1, failed: 0 })
    expect(calls).toHaveLength(1)
    expect(await readNotifiedAt(entryId)).not.toBeNull()
  })

  it('skips an approved entry with a null email and leaves it null', async () => {
    const withEmail = await seedApproved(fixture, { email: 'has@example.test', first_name: 'Has' })
    const noEmail = await seedApproved(fixture, { email: null, first_name: 'None' })

    const { calls, send } = capturingSender()
    const result = await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send })

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(calls).toHaveLength(1)
    expect(calls[0].to).toBe('has@example.test')
    expect(await readNotifiedAt(withEmail)).not.toBeNull()
    expect(await readNotifiedAt(noEmail)).toBeNull()
  })

  it('does not count a null-email entry in the bulk button total', async () => {
    await seedApproved(fixture, { email: 'has@example.test' })
    await seedApproved(fixture, { email: null })

    const result = await sendGuestConfirmations(fixture.showId)

    // One approved-with-email, so the button reports one, not two.
    expect(result.error).toBeNull()
    expect(result.count).toBe(1)
  })

  it('does nothing on a second send for an already-notified entry', async () => {
    const entryId = await seedApproved(fixture)

    const first = capturingSender()
    await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send: first.send })
    const firstNotifiedAt = await readNotifiedAt(entryId)
    expect(firstNotifiedAt).not.toBeNull()

    const second = capturingSender()
    const result = await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send: second.send })

    expect(result).toEqual({ sent: 0, failed: 0 })
    // The already-notified entry was not sent again, and its timestamp did not move.
    expect(second.calls).toHaveLength(0)
    expect(await readNotifiedAt(entryId)).toBe(firstNotifiedAt)
  })

  it('omits the doors line when the show has no doors day_item', async () => {
    await seedApproved(fixture)
    const { calls, send } = capturingSender()

    await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send })

    expect(calls).toHaveLength(1)
    // No doors row means no doors line at all, not "Doors: TBC".
    expect(calls[0].html).not.toContain('Doors')
    expect(calls[0].html).not.toContain('TBC')
  })

  it('includes a doors line drawn from the doors day_item', async () => {
    await seedApproved(fixture)

    // 18:30Z on the show date is 19:30 in Europe/London (BST), the fixture zone.
    const { error } = await testDb.from('day_items').insert({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'doors',
      starts_at: `${fixture.date}T18:30:00Z`,
    })
    if (error) throw new Error(`could not seed doors item: ${error.message}`)

    const { calls, send } = capturingSender()
    await sendGuestConfirmationEmails(testDb, { showId: fixture.showId, send })

    expect(calls).toHaveLength(1)
    expect(calls[0].html).toContain('Doors 19:30')
  })
})

// The body is pure, so the doors rule is pinned without a database too: this is
// the "unit test on the body" the brief asks for, alongside the integration
// check that the null comes from a missing day_item.
describe('guest confirmation body', () => {
  const base = {
    guestName: 'Dave Smith',
    venueName: 'Brixton Academy',
    showDate: 'Friday 14 June',
    address: '211 Stockwell Road, London',
    numTickets: 2,
    passType: 'ticket',
    passTypeDetail: null,
    pickup: null,
    pickupDetail: null,
    artistName: 'Test Artist',
  }

  it('has no doors line at all when doors is null', () => {
    const lines = guestConfirmationLines({ ...base, doorsTime: null })
    expect(lines.some((line) => /doors/i.test(line))).toBe(false)
    // And never invents a TBC placeholder for it.
    expect(lines.some((line) => /tbc/i.test(line))).toBe(false)
  })

  it('has a doors line when doors is a real time', () => {
    const lines = guestConfirmationLines({ ...base, doorsTime: '19:30' })
    expect(lines.some((line) => line.includes('Doors 19:30'))).toBe(true)
  })

  it('names the credential only when it is not a plain ticket', () => {
    const plain = guestConfirmationLines({ ...base, doorsTime: null })
    expect(plain.some((line) => /collect a/i.test(line))).toBe(false)

    const laminate = guestConfirmationLines({ ...base, doorsTime: null, passType: 'guest_laminate' })
    expect(laminate.some((line) => line.includes('Guest laminate'))).toBe(true)
  })
})
