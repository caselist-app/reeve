import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb, setTestUserId } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { setContactArtists } from '@/lib/actions/contacts'

// REE-233 / Brief 29 step 1. add_contact_to_tour is owns_tour()-gated
// (supabase/migrations/20260817105105_contact_artists.sql), so it cannot run
// under the service-role test client: auth.uid() is null with no JWT, and
// owns_tour(p_tour_id) is therefore false for every tour. fixture.ts bypasses
// the identical gate on create_show_with_dependents for the same reason, and
// create-show-revalidate.test.ts documents it. contact_artists' own RLS
// policy has the same shape (it reads auth.uid() too), so the cross-account
// half of this ticket's ask lives in tests/e2e/access.spec.ts instead, the
// only place a second account and a real session both exist. That mirrors
// REE-202's identical split for identity_documents.
//
// What IS testable here, without a real session, is the write shape
// add_contact_to_tour depends on: the RPC's own insert is
// `on conflict (contact_id, artist_id) do nothing`, so re-linking a contact
// who already worked that artist must not error and must not duplicate the
// row. That is real Postgres behaviour (the composite primary key and the
// insert's conflict target), exercised directly through testDb rather than
// through the gated RPC, the same shape identity-documents.test.ts uses for
// schema guarantees a generated type cannot capture.
describe('contact_artists is keyed on (contact_id, artist_id)', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  function link(overrides: Record<string, unknown> = {}) {
    return { contact_id: fixture.contactId, artist_id: fixture.artistId, ...overrides }
  }

  it('inserts exactly one row for a (contact_id, artist_id) pair', async () => {
    const { error } = await testDb.from('contact_artists').insert(link())
    expect(error).toBeNull()

    const { data } = await testDb
      .from('contact_artists')
      .select('contact_id, artist_id')
      .eq('contact_id', fixture.contactId)
      .eq('artist_id', fixture.artistId)

    expect(data).toHaveLength(1)
  })

  it('a repeat write for the same pair does not error or duplicate the row', async () => {
    const first = await testDb.from('contact_artists').insert(link())
    expect(first.error).toBeNull()

    // Mirrors the RPC's own statement, `insert into contact_artists (...)
    // values (...) on conflict (contact_id, artist_id) do nothing`.
    // ignoreDuplicates turns supabase-js's upsert into exactly that: an
    // INSERT sent with `Prefer: resolution=ignore-duplicates`, not an update.
    const repeat = await testDb
      .from('contact_artists')
      .upsert(link(), { onConflict: 'contact_id,artist_id', ignoreDuplicates: true })

    expect(repeat.error).toBeNull()

    const { data } = await testDb
      .from('contact_artists')
      .select('contact_id, artist_id')
      .eq('contact_id', fixture.contactId)
      .eq('artist_id', fixture.artistId)

    expect(data).toHaveLength(1)
  })

  it('allows the same contact linked to two different artists, proving this is many-to-many', async () => {
    const { data: otherArtist, error: otherArtistError } = await testDb
      .from('artists')
      .insert({ account_id: fixture.userId, name: 'Other Artist' })
      .select('id')
      .single()
    expect(otherArtistError).toBeNull()

    const first = await testDb.from('contact_artists').insert(link())
    expect(first.error).toBeNull()

    const second = await testDb
      .from('contact_artists')
      .insert(link({ artist_id: otherArtist!.id }))
    expect(second.error).toBeNull()

    const { data } = await testDb
      .from('contact_artists')
      .select('artist_id')
      .eq('contact_id', fixture.contactId)

    expect((data ?? []).map((r) => r.artist_id).sort()).toEqual(
      [fixture.artistId, otherArtist!.id].sort()
    )
  })
})

// REE-234 / Brief 29 step 2, "The save mechanism". setContactArtists is a
// plain server action, not an owns_tour()-gated RPC, so unlike
// add_contact_to_tour above it runs here without a real session:
// tests/integration/setup.ts mocks requireUser() to report the fixture's
// account and mocks createClient() to hand back testDb, so the action's own
// code runs for real against a real Postgres. That client is still
// service-role, so it does not enforce contact_artists' RLS policy itself;
// what proves "scoped to the caller's account" below is the action's own
// ownership check on both the contact and every artist id, the same shape as
// createTelegramLinkToken's contact lookup and the cross-tour-id rule in
// CLAUDE.md. Red first: setContactArtists does not exist yet.
describe('setContactArtists replaces the full set for a contact', () => {
  let fixture: Fixture
  let other: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    other = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
    await destroyFixture(other)
  })

  async function linkedArtistIds(contactId: string) {
    const { data } = await testDb
      .from('contact_artists')
      .select('artist_id')
      .eq('contact_id', contactId)
    return (data ?? []).map((r) => r.artist_id)
  }

  it('inserts the given artists when none existed before', async () => {
    setTestUserId(fixture.userId)

    const result = await setContactArtists(fixture.contactId, [fixture.artistId])
    expect(result.error).toBeNull()

    expect(await linkedArtistIds(fixture.contactId)).toEqual([fixture.artistId])
  })

  it('replaces the full set: adding one and removing one in the same call', async () => {
    setTestUserId(fixture.userId)

    const { data: secondArtist, error: secondArtistError } = await testDb
      .from('artists')
      .insert({ account_id: fixture.userId, name: 'Second Artist' })
      .select('id')
      .single()
    expect(secondArtistError).toBeNull()

    const first = await setContactArtists(fixture.contactId, [fixture.artistId])
    expect(first.error).toBeNull()

    const second = await setContactArtists(fixture.contactId, [secondArtist!.id])
    expect(second.error).toBeNull()

    expect(await linkedArtistIds(fixture.contactId)).toEqual([secondArtist!.id])
  })

  it('clears every link when called with an empty array', async () => {
    setTestUserId(fixture.userId)

    await setContactArtists(fixture.contactId, [fixture.artistId])

    const cleared = await setContactArtists(fixture.contactId, [])
    expect(cleared.error).toBeNull()

    expect(await linkedArtistIds(fixture.contactId)).toHaveLength(0)
  })

  it('is scoped to the caller: rejects a contact belonging to another account', async () => {
    setTestUserId(fixture.userId)

    const result = await setContactArtists(other.contactId, [other.artistId])
    expect(result.error).not.toBeNull()

    expect(await linkedArtistIds(other.contactId)).toHaveLength(0)
  })

  it('is scoped to the caller: rejects an artist id belonging to another account', async () => {
    setTestUserId(fixture.userId)

    const result = await setContactArtists(fixture.contactId, [other.artistId])
    expect(result.error).not.toBeNull()

    expect(await linkedArtistIds(fixture.contactId)).toHaveLength(0)
  })
})
