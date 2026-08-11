import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 52 step 2. The guest list tables carry their guarantees as check
// constraints and partial unique indexes, and a check constraint only exists in
// a real Postgres: the generated TypeScript types know a column is `string`, not
// that `status` may only be one of five values or that a declined reason cannot
// ride on an approved row. So these write directly through testDb, bypassing any
// action, and assert the database itself rejects the bad row.
//
// Both halves matter. A constraint that rejects too much is as broken as one
// that rejects nothing, and it fails in a way nobody notices until a TM cannot
// save a legitimate name. So every rejection here is paired with the near-miss
// row that must still be accepted.
//
// Failures are asserted on the Postgres error code, not merely on "an error
// happened". A typo in a column name also errors, and a test that accepts any
// error passes for the wrong reason. 23514 is check_violation, 23505 is
// unique_violation.

const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'

describe('the guest list schema enforces its constraints', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // A valid approved entry: both names, a real channel, a stated status. Every
  // rejection test starts from this and breaks exactly one thing.
  function entry(overrides: Record<string, unknown> = {}) {
    return {
      tour_id: fixture.tourId,
      show_id: fixture.showId,
      first_name: 'Dave',
      last_name: 'Smith',
      request_channel: 'app',
      status: 'approved',
      ...overrides,
    }
  }

  it('accepts a fully formed approved entry', async () => {
    // The baseline the near-miss rows are measured against: if this ever starts
    // failing, a constraint has become stricter than intended.
    const { error } = await testDb.from('guest_list_entries').insert(entry())
    expect(error).toBeNull()
  })

  describe('named_unless_draft', () => {
    it('rejects an approved row with a null last name', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ last_name: null }))
      expect(error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts a draft row with no name at all', async () => {
      // A chat request builds up over several messages, so a draft is allowed to
      // have neither name yet. It arrived over a channel, so it needs a requester.
      const { error } = await testDb.from('guest_list_entries').insert(
        entry({
          first_name: null,
          last_name: null,
          status: 'draft',
          request_channel: 'whatsapp',
          requested_by_person_id: fixture.personId,
        })
      )
      expect(error).toBeNull()
    })
  })

  describe('pass_type_other', () => {
    it('rejects pass_type other with a null detail', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ pass_type: 'other', pass_type_detail: null }))
      expect(error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts pass_type other once the detail is filled', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ pass_type: 'other', pass_type_detail: 'Tour bus pass' }))
      expect(error).toBeNull()
    })
  })

  describe('pickup_other', () => {
    it('rejects pickup other with a null detail', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ pickup: 'other', pickup_detail: null }))
      expect(error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts a non-other pickup with no detail', async () => {
      // The detail is required only when pickup is 'other'. A box office pickup
      // never carries one, so this must stay legal.
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ pickup: 'box_office', pickup_detail: null }))
      expect(error).toBeNull()
    })
  })

  describe('decline_reason_needs_declined', () => {
    it('rejects a decline reason on an approved row', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ decline_reason: 'over allotment' }))
      expect(error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts a decline reason on a declined row', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ status: 'declined', decline_reason: 'over allotment' }))
      expect(error).toBeNull()
    })
  })

  describe('chat_request_has_requester', () => {
    it('rejects a chat-channel row with a null requester', async () => {
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ request_channel: 'whatsapp', requested_by_person_id: null }))
      expect(error?.code).toBe(CHECK_VIOLATION)
    })

    it('accepts an app row with a null requester', async () => {
      // The TM's own add arrives over 'app' and has no requester: that is the
      // one channel the constraint lets through without one.
      const { error } = await testDb
        .from('guest_list_entries')
        .insert(entry({ request_channel: 'app', requested_by_person_id: null }))
      expect(error).toBeNull()
    })
  })

  describe('one_draft_per_person_show', () => {
    function draft() {
      return entry({
        first_name: null,
        last_name: null,
        status: 'draft',
        request_channel: 'telegram',
        requested_by_person_id: fixture.personId,
      })
    }

    it('rejects a second draft for the same person and show', async () => {
      const first = await testDb.from('guest_list_entries').insert(draft())
      expect(first.error).toBeNull()

      const second = await testDb.from('guest_list_entries').insert(draft())
      expect(second.error?.code).toBe(UNIQUE_VIOLATION)
    })

    it('allows two requested rows for the same person and show', async () => {
      // The index is partial on status = 'draft', so a crew member can genuinely
      // have two names on one show once each has left draft.
      const requested = () =>
        entry({
          status: 'requested',
          request_channel: 'telegram',
          requested_by_person_id: fixture.personId,
        })

      const first = await testDb.from('guest_list_entries').insert(requested())
      expect(first.error).toBeNull()

      const second = await testDb.from('guest_list_entries').insert(requested())
      expect(second.error).toBeNull()
    })
  })

  describe('guest_list_allotments show/pass uniqueness', () => {
    function allotment(overrides: Record<string, unknown> = {}) {
      return {
        tour_id: fixture.tourId,
        show_id: fixture.showId,
        pass_type: 'ticket',
        num_allowed: 8,
        ...overrides,
      }
    }

    it('rejects a second allotment for the same show and pass type', async () => {
      const first = await testDb.from('guest_list_allotments').insert(allotment())
      expect(first.error).toBeNull()

      const second = await testDb.from('guest_list_allotments').insert(allotment())
      expect(second.error?.code).toBe(UNIQUE_VIOLATION)
    })

    it('allows a different pass type on the same show', async () => {
      const first = await testDb.from('guest_list_allotments').insert(allotment())
      expect(first.error).toBeNull()

      const second = await testDb
        .from('guest_list_allotments')
        .insert(allotment({ pass_type: 'aaa', num_allowed: 2 }))
      expect(second.error).toBeNull()
    })
  })
})
