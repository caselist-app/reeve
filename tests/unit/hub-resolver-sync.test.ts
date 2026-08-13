import { describe, it, expect, vi } from 'vitest'

// hub-resolver.ts also exports resolveHub, which pulls in
// lib/supabase/admin.ts for the async job path. That file imports the
// 'server-only' package, which is a Next.js build-time guard with nothing to
// resolve outside a Next bundle, so a plain vitest run has no package to find.
// resolveHubSync itself makes no admin-client call, so stubbing the import out
// is enough to reach it.
vi.mock('server-only', () => ({}))

import { resolveHubSync } from '@/lib/logistics/hub-resolver'

// REE-214. resolveHubSync is the piece createShow/updateShow call inline: a
// known-venue lookup or a local haversine calculation against the bundled
// airport list, neither of which makes a network call, so both are safe to
// run synchronously in the same request as the save.
describe('resolveHubSync', () => {
  it('resolves a known venue by name, ignoring any coordinates passed', () => {
    const result = resolveHubSync('Hellfest', null, null)
    expect(result).toEqual({ iata: 'NTE', rail: null, ground_minutes: 40 })
  })

  it('is case- and whitespace-insensitive on the venue name, matching lookupKnownVenue', () => {
    const result = resolveHubSync('  HELLFEST  ', null, null)
    expect(result?.iata).toBe('NTE')
  })

  it('finds the nearest airport from coordinates when the venue is not known', () => {
    // Heathrow's own coordinates: the nearest bundled airport is itself.
    const result = resolveHubSync('Some Unknown Venue', 51.4775, -0.4614)
    expect(result?.iata).toBe('LHR')
    expect(result?.rail).toBeNull()
    expect(result?.ground_minutes).toBeGreaterThan(0)
  })

  it('returns null when the venue is unknown and no coordinates are given', () => {
    expect(resolveHubSync('Some Unknown Venue', null, null)).toBeNull()
  })

  it('returns null when only one of lat/lng is given', () => {
    expect(resolveHubSync('Some Unknown Venue', 51.5074, null)).toBeNull()
    expect(resolveHubSync('Some Unknown Venue', null, -0.1278)).toBeNull()
  })
})
