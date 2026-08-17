import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { resolveRehearsalTimezone } from '@/lib/logistics/hub-resolver'

// resolve-rehearsal-timezone is a Trigger.dev task and needs
// TRIGGER_SECRET_KEY plus a running Trigger.dev, neither of which exists here.
// Mocked the same way hub-resolve-inline.test.ts mocks resolve-hub, so
// updateRehearsal's clear-then-trigger write is observable without the enqueue
// throwing.
vi.mock('@/trigger/jobs/resolve-rehearsal-timezone', () => ({
  resolveRehearsalTimezoneJob: { trigger: vi.fn() },
}))

import { resolveRehearsalTimezoneJob } from '@/trigger/jobs/resolve-rehearsal-timezone'
import { updateRehearsal } from '@/lib/actions/rehearsals'

// REE-243. Gives a rehearsal the same automatic timezone lookup a show gets
// (REE-242), using its address, with no airport lookup: a rehearsal space is
// not a touring stop the planner ranks travel against. supabase-js makes its
// own requests through the global fetch, the same one geocodeVenueTimezone
// calls through, so a blanket global.fetch mock would swallow
// resolveRehearsalTimezone's own read of the rehearsal and fail every test
// with a misleading "Rehearsal not found". mockGoogleFetch only intercepts
// requests to the Geocoding and Time Zone endpoints and passes everything
// else, including supabase-js's own calls, through to the real fetch.
function mockGoogleFetch(opts: {
  geocode?: { status: string; results: { geometry: { location: { lat: number; lng: number } } }[] }
  timezone?: { status: string; timeZoneId?: string }
}) {
  const real = global.fetch
  const calls: string[] = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.startsWith('https://maps.googleapis.com/maps/api/geocode/json')) {
      calls.push('geocode')
      return { json: async () => opts.geocode } as Response
    }
    if (url.startsWith('https://maps.googleapis.com/maps/api/timezone/json')) {
      calls.push('timezone')
      return { json: async () => opts.timezone } as Response
    }
    return real(input, init)
  }) as unknown as typeof fetch
  return calls
}

async function insertRehearsal(fixture: Fixture, overrides: { address?: string | null } = {}) {
  const { data: tourDate, error: tourDateError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: fixture.tourId, date: '2026-06-20', day_type: 'rehearsal' })
    .select('id')
    .single()
  if (tourDateError || !tourDate) throw new Error(`test: could not create tour_date: ${tourDateError?.message}`)

  const { data: rehearsal, error } = await testDb
    .from('rehearsals')
    .insert({
      tour_id: fixture.tourId,
      tour_date_id: tourDate.id,
      location_name: 'Test Rehearsal Space',
      address: overrides.address ?? null,
    })
    .select('id')
    .single()
  if (error || !rehearsal) throw new Error(`test: could not create rehearsal: ${error?.message}`)

  return rehearsal.id
}

describe('resolveRehearsalTimezone resolves and caches coordinates and timezone', () => {
  let fixture: Fixture
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY
  const originalFetch = global.fetch

  beforeEach(async () => {
    fixture = await createFixture()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
  })

  afterEach(async () => {
    global.fetch = originalFetch
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('resolves venue_lat, venue_lng and timezone for a rehearsal with an address', async () => {
    const rehearsalId = await insertRehearsal(fixture, { address: '1 Elm Street, Springfield' })

    mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'Europe/London' },
    })

    await resolveRehearsalTimezone(rehearsalId)

    const { data: rehearsal } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()

    expect(rehearsal?.venue_lat).toBe(51.5074)
    expect(rehearsal?.venue_lng).toBe(-0.1278)
    expect(rehearsal?.timezone).toBe('Europe/London')
  })

  it('saves fine with no resolution attempted for a rehearsal with no address', async () => {
    const rehearsalId = await insertRehearsal(fixture, { address: null })

    const calls = mockGoogleFetch({})

    await resolveRehearsalTimezone(rehearsalId)

    expect(calls).toHaveLength(0)

    const { data: rehearsal } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()

    expect(rehearsal?.venue_lat).toBeNull()
    expect(rehearsal?.venue_lng).toBeNull()
    expect(rehearsal?.timezone).toBeNull()
  })
})

describe('updateRehearsal clears and re-triggers resolution on address change', () => {
  let fixture: Fixture
  const originalApiKey = process.env.GOOGLE_MAPS_API_KEY
  const originalFetch = global.fetch

  beforeEach(async () => {
    fixture = await createFixture()
    process.env.GOOGLE_MAPS_API_KEY = 'test-key'
    vi.mocked(resolveRehearsalTimezoneJob.trigger).mockClear()
  })

  afterEach(async () => {
    global.fetch = originalFetch
    process.env.GOOGLE_MAPS_API_KEY = originalApiKey
    vi.restoreAllMocks()
    await destroyFixture(fixture)
  })

  it('clears the old coordinates and timezone in the same write, then re-resolves for the new address', async () => {
    const rehearsalId = await insertRehearsal(fixture, { address: '1 Elm Street, Springfield' })

    mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'Europe/London' },
    })
    await resolveRehearsalTimezone(rehearsalId)

    const { data: before } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()
    expect(before?.timezone).toBe('Europe/London')

    const result = await updateRehearsal(rehearsalId, { address: '350 Fifth Avenue, New York' })
    expect(result.error).toBeNull()

    // Cleared in the same write as the address change, before the job has had
    // any chance to run: the old coordinates belong to the old address.
    const { data: cleared } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()
    expect(cleared?.venue_lat).toBeNull()
    expect(cleared?.venue_lng).toBeNull()
    expect(cleared?.timezone).toBeNull()

    expect(resolveRehearsalTimezoneJob.trigger).toHaveBeenCalledWith({ rehearsal_id: rehearsalId })

    // Simulates the job running: resolveRehearsalTimezoneJob.run does nothing
    // but await this same function.
    mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 40.7484, lng: -73.9857 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'America/New_York' },
    })
    await resolveRehearsalTimezone(rehearsalId)

    const { data: after } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()
    expect(after?.venue_lat).toBe(40.7484)
    expect(after?.venue_lng).toBe(-73.9857)
    expect(after?.timezone).toBe('America/New_York')
  })

  it('does not clear or re-trigger when the address is unchanged', async () => {
    const rehearsalId = await insertRehearsal(fixture, { address: '1 Elm Street, Springfield' })

    mockGoogleFetch({
      geocode: {
        status: 'OK',
        results: [{ geometry: { location: { lat: 51.5074, lng: -0.1278 } } }],
      },
      timezone: { status: 'OK', timeZoneId: 'Europe/London' },
    })
    await resolveRehearsalTimezone(rehearsalId)
    vi.mocked(resolveRehearsalTimezoneJob.trigger).mockClear()

    const result = await updateRehearsal(rehearsalId, { location_name: 'Renamed Space' })
    expect(result.error).toBeNull()

    expect(resolveRehearsalTimezoneJob.trigger).not.toHaveBeenCalled()

    const { data: rehearsal } = await testDb
      .from('rehearsals')
      .select('venue_lat, venue_lng, timezone')
      .eq('id', rehearsalId)
      .single()
    expect(rehearsal?.venue_lat).toBe(51.5074)
    expect(rehearsal?.venue_lng).toBe(-0.1278)
    expect(rehearsal?.timezone).toBe('Europe/London')
  })
})
