import { describe, it, expect } from 'vitest'
import {
  toDatetimeLocal,
  fromDatetimeLocal,
  wallClockToUtc,
  localDateInZone,
  localTimeInZone,
  localDayWindowUtc,
} from '@/lib/schedule/datetime'

// These are pure, so they are unit tests: they run with `pnpm test` and need no
// Docker. That matters, because they are the part of the day-link fix most
// likely to be subtly wrong and least likely to look wrong when read.
//
// Every expectation here is a wall-clock fact about a real timezone, not a
// restatement of the implementation. Auckland is UTC+12 in June (southern
// winter, no DST) and London is UTC+1 in June and UTC+0 in January, which is
// what makes the pair useful: one crosses the date line relative to UTC, the
// other changes offset across the year.

describe('localDateInZone', () => {
  it('gives the tour-local day, not the UTC day', () => {
    // The case that put segments on the wrong day: 22:00Z is already tomorrow
    // in Auckland, so a departure then belongs to the 15th on the schedule.
    expect(localDateInZone('2030-06-14T22:00:00.000Z', 'Pacific/Auckland')).toBe('2030-06-15')
    expect(localDateInZone('2030-06-14T09:00:00.000Z', 'Pacific/Auckland')).toBe('2030-06-14')
  })

  it('handles a zone behind UTC', () => {
    expect(localDateInZone('2030-06-15T02:00:00.000Z', 'America/Los_Angeles')).toBe('2030-06-14')
  })

  it('handles the hour either side of local midnight in a DST zone', () => {
    expect(localDateInZone('2030-06-14T22:59:00.000Z', 'Europe/London')).toBe('2030-06-14')
    expect(localDateInZone('2030-06-14T23:01:00.000Z', 'Europe/London')).toBe('2030-06-15')
  })
})

describe('localTimeInZone', () => {
  it('reads a stored instant back as the wall-clock time the TM entered', () => {
    expect(localTimeInZone('2030-06-15T08:00:00.000Z', 'Europe/London')).toBe('09:00')
  })

  it('reads an instant unchanged under UTC, which is the no-timezone fallback', () => {
    expect(localTimeInZone('2030-06-15T08:00:00.000Z', 'UTC')).toBe('08:00')
  })
})

describe('localDayWindowUtc', () => {
  it('covers the tour-local day, not the UTC calendar day', () => {
    // Auckland is 12 hours ahead in June, so its 15th starts at noon UTC on the
    // 14th. Filtering depart_at by `2030-06-15T00:00:00Z` to the next midnight
    // would take the second half of the local 15th and the first half of the
    // 16th.
    const window = localDayWindowUtc('2030-06-15', 'Pacific/Auckland')
    expect(window.start).toBe('2030-06-14T12:00:00.000Z')
    expect(window.end).toBe('2030-06-15T12:00:00.000Z')
  })

  it('is the plain calendar day under UTC', () => {
    const window = localDayWindowUtc('2030-06-15', 'UTC')
    expect(window.start).toBe('2030-06-15T00:00:00.000Z')
    expect(window.end).toBe('2030-06-16T00:00:00.000Z')
  })

  it('follows the offset across a DST change rather than assuming one', () => {
    expect(localDayWindowUtc('2030-06-15', 'Europe/London').start).toBe('2030-06-14T23:00:00.000Z')
    expect(localDayWindowUtc('2030-01-15', 'Europe/London').start).toBe('2030-01-15T00:00:00.000Z')
  })

  it('is half-open, so consecutive days abut without overlapping', () => {
    const first = localDayWindowUtc('2030-06-15', 'Pacific/Auckland')
    const second = localDayWindowUtc('2030-06-16', 'Pacific/Auckland')
    expect(first.end).toBe(second.start)
  })
})

describe('wallClockToUtc', () => {
  it('reads the same wall-clock time differently either side of a DST change', () => {
    // This is why a show moving date re-derives its times instead of adding 24
    // hours: 10:00 is 09:00Z in June and 10:00Z in January.
    expect(wallClockToUtc('2030-06-15T10:00', 'Europe/London')).toBe('2030-06-15T09:00:00.000Z')
    expect(wallClockToUtc('2030-01-15T10:00', 'Europe/London')).toBe('2030-01-15T10:00:00.000Z')
  })
})

describe('toDatetimeLocal', () => {
  it('separates the date and time with T, which is what the input accepts', () => {
    // 'sv-SE' formats with a space. A datetime-local input sanitises its value
    // against a normalised local date and time string, discards a space, and
    // renders empty, and an empty field then saves as null over a real time.
    const value = toDatetimeLocal('2030-06-15T09:00:00.000Z', 'Europe/London')
    expect(value).toBe('2030-06-15T10:00')
    expect(value).not.toContain(' ')
  })

  it('returns an empty string for a null instant, which is what an empty input wants', () => {
    expect(toDatetimeLocal(null, 'Europe/London')).toBe('')
  })
})

describe('toDatetimeLocal and fromDatetimeLocal round trip', () => {
  it('returns the instant it started from', () => {
    const original = '2030-06-15T09:00:00.000Z'
    for (const tz of ['Europe/London', 'Pacific/Auckland', 'America/Los_Angeles', 'UTC']) {
      expect(fromDatetimeLocal(toDatetimeLocal(original, tz), tz)).toBe(original)
    }
  })

  it('treats an empty input as a cleared value rather than an instant', () => {
    expect(fromDatetimeLocal('', 'Europe/London')).toBeNull()
    expect(fromDatetimeLocal(null, 'Europe/London')).toBeNull()
  })
})
