import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// resolve-hub is a Trigger.dev task and needs TRIGGER_SECRET_KEY plus a
// running Trigger.dev, neither of which exists here. Mocked the same way
// create-show-revalidate.test.ts mocks it, so the inline path (which should
// never call this) and the fallback path (which should) are both observable.
vi.mock('@/trigger/jobs/resolve-hub', () => ({
  resolveHubJob: { trigger: vi.fn() },
}))

import { resolveHubJob } from '@/trigger/jobs/resolve-hub'
import { createShow, updateShow } from '@/lib/actions/shows'

// create_show_with_dependents gates on owns_tour(), which needs auth.uid() and
// does not exist under the service-role test client (see
// create-show-revalidate.test.ts). This stands in for it: the real RPC upserts
// a tour_dates row for the date, then inserts the show against it, so this
// does the same rather than reusing the fixture's existing tour_date_id, which
// belongs to a different date and would fail the shows (tour_date_id, date)
// composite foreign key.
function insertShowViaStubRpc(fixture: Fixture) {
  return async (_fn: string, args: unknown) => {
    const showData = (args as { p_show_data: { date: string; venue_name: string } }).p_show_data

    const { data: tourDate, error: tourDateError } = await testDb
      .from('tour_dates')
      .insert({ tour_id: fixture.tourId, date: showData.date, day_type: 'show' })
      .select('id')
      .single()
    if (tourDateError || !tourDate) throw new Error(`stub rpc: tour_date insert failed: ${tourDateError?.message}`)

    const { data: show, error } = await testDb
      .from('shows')
      .insert({
        tour_id: fixture.tourId,
        tour_date_id: tourDate.id,
        date: showData.date,
        venue_name: showData.venue_name,
      })
      .select('id')
      .single()
    if (error || !show) throw new Error(`stub rpc: show insert failed: ${error?.message}`)

    return { data: show.id, error: null }
  }
}

// REE-214. Finding the nearest transport hub from known coordinates is a local
// haversine calculation against a bundled airport list: no network call. Once
// venue_lat/venue_lng are already on the row (a Places pick, REE-213) or the
// venue matches the known-venue list, there is nothing left to wait for, so
// createShow/updateShow resolve the hub inline instead of enqueuing the async
// resolve-hub job. The job remains the fallback for an address typed by hand
// with no Places selection, which still needs a server-side geocode.
describe('createShow resolves the hub inline when it can', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    vi.mocked(resolveHubJob.trigger).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('writes the hub fields in the same request for a known-venue match, with no job enqueued', async () => {
    // create_show_with_dependents gates on owns_tour(), which needs auth.uid()
    // and does not exist under the service-role test client (see
    // create-show-revalidate.test.ts). Stubbed to do the one thing this test
    // needs from it: insert a real shows row so the inline update afterward has
    // something real to land on.
    const rpcSpy = vi.spyOn(testDb, 'rpc').mockImplementation(insertShowViaStubRpc(fixture))

    const result = await createShow(fixture.tourId, {
      date: '2030-09-02',
      venue_name: 'Hellfest',
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).not.toHaveBeenCalled()

    const { data: show } = await testDb
      .from('shows')
      .select('transport_hub_iata, hub_resolved_at')
      .eq('id', result.showId!)
      .single()

    expect(show?.transport_hub_iata).toBe('NTE')
    expect(show?.hub_resolved_at).not.toBeNull()

    rpcSpy.mockRestore()
  })

  it('writes the hub fields in the same request when coordinates arrive from a Places pick', async () => {
    const rpcSpy = vi.spyOn(testDb, 'rpc').mockImplementation(insertShowViaStubRpc(fixture))

    const result = await createShow(fixture.tourId, {
      date: '2030-09-03',
      venue_name: 'Some New Venue',
      lat: 51.4775,
      lng: -0.4614,
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).not.toHaveBeenCalled()

    const { data: show } = await testDb
      .from('shows')
      .select('transport_hub_iata, hub_resolved_at')
      .eq('id', result.showId!)
      .single()

    expect(show?.transport_hub_iata).toBe('LHR')
    expect(show?.hub_resolved_at).not.toBeNull()

    rpcSpy.mockRestore()
  })

  it('falls back to the async job when neither coordinates nor a known venue apply', async () => {
    const rpcSpy = vi
      .spyOn(testDb, 'rpc')
      .mockResolvedValue({ data: fixture.showId, error: null } as never)

    const result = await createShow(fixture.tourId, {
      date: '2030-09-04',
      venue_name: 'Some Unresolvable Venue',
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).toHaveBeenCalledWith({ show_id: fixture.showId })

    rpcSpy.mockRestore()
  })
})

describe('updateShow resolves the hub inline when it can', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
    vi.mocked(resolveHubJob.trigger).mockClear()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('writes the hub inline when the changed address carries coordinates from a Places pick', async () => {
    const result = await updateShow(fixture.showId, {
      date: fixture.date,
      venue_name: 'Test Venue',
      address: '1 Elm Street, Springfield',
      lat: 51.4775,
      lng: -0.4614,
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).not.toHaveBeenCalled()

    const { data: show } = await testDb
      .from('shows')
      .select('transport_hub_iata, venue_lat, venue_lng, hub_resolved_at')
      .eq('id', fixture.showId)
      .single()

    expect(show?.transport_hub_iata).toBe('LHR')
    expect(show?.venue_lat).toBe(51.4775)
    expect(show?.venue_lng).toBe(-0.4614)
    expect(show?.hub_resolved_at).not.toBeNull()
  })

  it('writes the hub inline for a known-venue match even with no coordinates', async () => {
    const result = await updateShow(fixture.showId, {
      date: fixture.date,
      venue_name: 'Glastonbury',
      address: 'Worthy Farm, Pilton',
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).not.toHaveBeenCalled()

    const { data: show } = await testDb
      .from('shows')
      .select('transport_hub_iata, transport_hub_rail, hub_resolved_at')
      .eq('id', fixture.showId)
      .single()

    expect(show?.transport_hub_iata).toBe('BRS')
    expect(show?.transport_hub_rail).toBe('Castle Cary')
    expect(show?.hub_resolved_at).not.toBeNull()
  })

  it('falls back to the async job when the address changes with no coordinates and no known venue', async () => {
    const result = await updateShow(fixture.showId, {
      date: fixture.date,
      venue_name: 'Test Venue',
      address: 'Somewhere hand-typed with no Places pick',
    })

    expect(result.error).toBeNull()
    expect(resolveHubJob.trigger).toHaveBeenCalledWith({ show_id: fixture.showId })

    const { data: show } = await testDb
      .from('shows')
      .select('transport_hub_iata, hub_resolved_at')
      .eq('id', fixture.showId)
      .single()

    expect(show?.transport_hub_iata).toBeNull()
    expect(show?.hub_resolved_at).toBeNull()
  })

  // REE-245: timezone is cached off the old address the same way the hub
  // fields are, and going stale has no symptom on the show row itself, unlike
  // the hub fields (the planner UI would show "Resolving..."). Times just
  // render in the wrong zone with nothing on screen saying so, which is why
  // this needs its own assertion alongside the fields already covered above.
  it('clears the resolved timezone alongside the hub fields on address change', async () => {
    const { error: seedError } = await testDb
      .from('shows')
      .update({
        venue_lat: 51.4775,
        venue_lng: -0.4614,
        transport_hub_iata: 'LHR',
        transport_hub_rail: 'Reading',
        hub_ground_minutes: 45,
        hub_resolved_at: new Date().toISOString(),
        timezone: 'Europe/London',
      })
      .eq('id', fixture.showId)
    expect(seedError).toBeNull()

    const result = await updateShow(fixture.showId, {
      date: fixture.date,
      venue_name: 'Test Venue',
      address: 'Somewhere hand-typed with no Places pick',
    })

    expect(result.error).toBeNull()

    const { data: show } = await testDb
      .from('shows')
      .select('venue_lat, venue_lng, transport_hub_iata, transport_hub_rail, hub_ground_minutes, timezone')
      .eq('id', fixture.showId)
      .single()

    expect(show?.venue_lat).toBeNull()
    expect(show?.venue_lng).toBeNull()
    expect(show?.transport_hub_iata).toBeNull()
    expect(show?.transport_hub_rail).toBeNull()
    expect(show?.hub_ground_minutes).toBeNull()
    expect(show?.timezone).toBeNull()
  })
})
