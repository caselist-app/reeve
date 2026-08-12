import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, createSecondTour, destroyFixture, type Fixture } from './fixture'
import {
  createGuestEntry,
  updateGuestEntry,
  approveGuestEntry,
} from '@/lib/actions/guest-list'
import { decideGuestEntry } from '@/lib/guest-list/decide'

// Brief 52, step 3 (REE-130). The guest list actions, tested against a real
// Postgres so the check constraints and the partial-write semantics are the real
// ones, not a mock's.
//
// Every assertion here reads the row back after the action and checks its state.
// A returned { error: null } proves nothing: updateDaySheet returned no error the
// entire time it was nulling catering columns, which is the whole reason this
// class of test exists.

describe('guest list partial writes', () => {
  let fixture: Fixture
  let entryId: string

  // A TM-added entry, through the real action, carrying both a note and a guest
  // type. Those two are the fields a later num_tickets-only save must not touch.
  beforeEach(async () => {
    fixture = await createFixture()

    const created = await createGuestEntry({
      tour_id: fixture.tourId,
      show_id: fixture.showId,
      first_name: 'Dave',
      last_name: 'Smith',
      guest_type: 'industry',
      num_tickets: 2,
      notes: 'Collecting for the support act.',
    })
    if (created.error || !created.entryId) {
      throw new Error(`could not seed a guest entry: ${created.error}`)
    }
    entryId = created.entryId
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readEntry() {
    const { data } = await testDb
      .from('guest_list_entries')
      .select('*')
      .eq('id', entryId)
      .single()
    return data
  }

  it('leaves notes and guest type alone when only the ticket count moves', async () => {
    const before = await readEntry()

    const result = await updateGuestEntry(entryId, { num_tickets: 4 })
    expect(result.error).toBeNull()

    const after = await readEntry()
    // The two fields the form never sent survive.
    expect(after?.notes).toBe(before?.notes)
    expect(after?.guest_type).toBe(before?.guest_type)
    // And the one it did send moved, or every assertion above passes on an action
    // that did nothing.
    expect(after?.num_tickets).toBe(4)
  })

  it('clears the notes when the TM blanks them, because null is not undefined', async () => {
    expect((await readEntry())?.notes).not.toBeNull()

    const result = await updateGuestEntry(entryId, { notes: '' })
    expect(result.error).toBeNull()

    const after = await readEntry()
    expect(after?.notes).toBeNull()
    // The guest type is untouched: clearing a note is not clearing a type.
    expect(after?.guest_type).toBe('industry')
  })
})

describe('guest list approve and decline guards', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // A chat request, inserted directly so it starts life as 'requested' rather
  // than the 'approved' a TM add would write. request_channel is not 'app', so
  // the chat-request-has-requester constraint needs a requester, which the
  // fixture's own person supplies.
  async function seedRequested(f: Fixture): Promise<string> {
    const { data, error } = await testDb
      .from('guest_list_entries')
      .insert({
        tour_id: f.tourId,
        show_id: f.showId,
        first_name: 'Rae',
        last_name: 'Nolan',
        request_channel: 'whatsapp',
        requested_by_person_id: f.personId,
        status: 'requested',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`could not seed a requested entry: ${error?.message}`)
    return data.id
  }

  it('approves a requested entry and no-ops a second approval', async () => {
    const id = await seedRequested(fixture)

    const first = await approveGuestEntry(fixture.tourId, id)
    expect(first.error).toBeNull()
    expect(first.alreadyDecided).toBeFalsy()

    const afterFirst = await testDb
      .from('guest_list_entries')
      .select('status, updated_at')
      .eq('id', id)
      .single()
    expect(afterFirst.data?.status).toBe('approved')

    const second = await approveGuestEntry(fixture.tourId, id)
    expect(second.error).toBeNull()
    // The second approval reports it was already decided rather than doing
    // anything, which is what stops the guest getting a second email.
    expect(second.alreadyDecided).toBe(true)

    const afterSecond = await testDb
      .from('guest_list_entries')
      .select('status, updated_at')
      .eq('id', id)
      .single()
    expect(afterSecond.data?.status).toBe('approved')
    // No write happened, so the row's updated_at did not move.
    expect(afterSecond.data?.updated_at).toBe(afterFirst.data?.updated_at)
  })

  // The Telegram button path (REE-135) calls decideGuestEntry directly, with no
  // requireUser, the way the account holder's tap resolves an account rather than
  // a web session (brief 30's runBroadcast split). The guard has to hold on this
  // path too, because it is the one that fires the guest's confirmation email
  // (REE-136 sends on the 'requested' -> 'approved' transition). A second tap,
  // whether a double press or a stale button after the TM already approved in the
  // panel, must not re-fire that transition and send a second email.
  //
  // This is the two-step shape: decide, then look somewhere the status alone does
  // not tell you. The proof the second call did nothing is that updated_at did
  // not move: no write happened, so no side effect (the email included) could.
  it('no-ops a second approval on the job path, so nothing re-fires', async () => {
    const id = await seedRequested(fixture)

    const first = await decideGuestEntry(testDb, {
      entryId: id,
      tourId: fixture.tourId,
      decision: 'approve',
    })
    expect(first.error).toBeNull()
    expect(first.alreadyDecided).toBeFalsy()
    expect(first.status).toBe('approved')

    const afterFirst = await testDb
      .from('guest_list_entries')
      .select('status, updated_at')
      .eq('id', id)
      .single()
    expect(afterFirst.data?.status).toBe('approved')

    const second = await decideGuestEntry(testDb, {
      entryId: id,
      tourId: fixture.tourId,
      decision: 'approve',
    })
    expect(second.error).toBeNull()
    // The second call reports it was already decided rather than writing again,
    // which is what stops a second confirmation email being sent to the guest.
    expect(second.alreadyDecided).toBe(true)
    expect(second.status).toBe('approved')

    const afterSecond = await testDb
      .from('guest_list_entries')
      .select('status, updated_at')
      .eq('id', id)
      .single()
    // No write on the second call, so updated_at is unchanged: the transition
    // that would fire the email happened exactly once.
    expect(afterSecond.data?.updated_at).toBe(afterFirst.data?.updated_at)
  })

  it('refuses to approve an entry from another tour', async () => {
    const other = await createSecondTour(fixture)
    const id = await seedRequested(fixture)

    // Acting on tour B with tour A's entry. The shared core scopes its read by
    // tour, so this is not found rather than approved from the wrong surface.
    const result = await approveGuestEntry(other.tourId, id)
    expect(result.error).toBeTruthy()

    // The row is untouched: still requested, not approved by a cross-tour call.
    const { data } = await testDb
      .from('guest_list_entries')
      .select('status')
      .eq('id', id)
      .single()
    expect(data?.status).toBe('requested')
  })
})
