import { describe, it, expect, afterEach, vi } from 'vitest'
import { detectBrowserTourTimezone } from '@/lib/schedule/detect-timezone'
import { TOUR_TIMEZONES } from '@/lib/validators/tour'

// The helper that fixes REE-119: it turns the browser's own zone into a value
// the tour timezone selector can hold, so a tour is never silently left on the
// 'UTC' fallback that put the day calendar's now-marker an hour behind a BST TM.
//
// The one rule that matters is the gate: it must only return a zone the selector
// actually lists, because the Select cannot show an option it does not have. So
// the tests pin both sides of that gate, stubbing Intl to stand in for a browser
// sitting in a given zone.

function stubZone(zone: string) {
  vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
    resolvedOptions: () => ({ timeZone: zone }),
  } as unknown as Intl.DateTimeFormat)
}

describe('detectBrowserTourTimezone', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns a detected zone that Reeve offers', () => {
    stubZone('Europe/London')
    expect(detectBrowserTourTimezone()).toBe('Europe/London')
  })

  it('returns null for a zone outside the curated list', () => {
    // A real IANA zone, but not one the touring selector carries. Preselecting
    // it would set the Select to a value it has no option for, so we decline.
    stubZone('Antarctica/McMurdo')
    expect(TOUR_TIMEZONES.some((tz) => tz.value === 'Antarctica/McMurdo')).toBe(false)
    expect(detectBrowserTourTimezone()).toBeNull()
  })
})
