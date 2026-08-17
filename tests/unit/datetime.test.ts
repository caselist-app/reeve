import { describe, it, expect } from 'vitest'
import {
  toDatetimeLocal,
  fromDatetimeLocal,
  wallClockToUtc,
  localDateInZone,
  localTimeInZone,
  localDayWindowUtc,
  resolveTimezone,
  addDays,
  daysBetween,
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

describe('resolveTimezone', () => {
  it('returns the record timezone regardless of the tour timezone', () => {
    expect(resolveTimezone({ timezone: 'Pacific/Auckland' }, 'Europe/London')).toBe(
      'Pacific/Auckland',
    )
  })

  it('falls back to the tour timezone when the record has none', () => {
    expect(resolveTimezone({ timezone: null }, 'Europe/London')).toBe('Europe/London')
  })

  it('falls back to UTC when neither the record nor the tour has one', () => {
    expect(resolveTimezone({ timezone: null }, null)).toBe('UTC')
  })
})

// REE-248: rehearsal-form.tsx and the rehearsal detail page used to read raw
// UTC digits off start_at/end_at with no timezone conversion at all
// (`iso.slice(0, 16)`), so a rehearsal's stored times rendered and saved as
// though the tour ran on UTC. This pins the fix's exact call shape,
// resolveTimezone(rehearsal, tour.timezone) feeding toDatetimeLocal and
// fromDatetimeLocal, against Perth (UTC+8, no DST) rather than UTC, so a
// regression back to slicing the ISO string directly would fail here even
// though it happens to work by coincidence for a UTC tour.
describe('rehearsal datetime round trip (REE-248)', () => {
  it('round-trips start_at/end_at using the rehearsal\'s own resolved timezone', () => {
    const rehearsal = { timezone: 'Australia/Perth' }
    const tourTimezone = 'Europe/London'
    const tz = resolveTimezone(rehearsal, tourTimezone)
    expect(tz).toBe('Australia/Perth')

    const startAt = '2030-06-15T01:00:00.000Z'
    const endAt = '2030-06-15T04:00:00.000Z'

    const startLocal = toDatetimeLocal(startAt, tz)
    const endLocal = toDatetimeLocal(endAt, tz)
    expect(startLocal).toBe('2030-06-15T09:00')
    expect(endLocal).toBe('2030-06-15T12:00')

    expect(fromDatetimeLocal(startLocal, tz)).toBe(startAt)
    expect(fromDatetimeLocal(endLocal, tz)).toBe(endAt)
  })

  it('falls back to the tour timezone when the rehearsal has none, and round-trips against that', () => {
    const rehearsal = { timezone: null }
    const tourTimezone = 'Australia/Perth'
    const tz = resolveTimezone(rehearsal, tourTimezone)
    expect(tz).toBe('Australia/Perth')

    const startAt = '2030-06-15T01:00:00.000Z'
    const startLocal = toDatetimeLocal(startAt, tz)
    expect(startLocal).toBe('2030-06-15T09:00')
    expect(fromDatetimeLocal(startLocal, tz)).toBe(startAt)
  })
})

// Plain calendar arithmetic, no timezone. These moved here from the retired
// day-sheet-times module (REE-23): the day item roll-over still needs them, and
// they belong beside the other date helpers rather than in a file named after a
// table that no longer exists.
describe('addDays', () => {
  it('returns the same date for offset zero', () => {
    expect(addDays('2026-06-14', 0)).toBe('2026-06-14')
  })

  it('advances one day', () => {
    expect(addDays('2026-06-14', 1)).toBe('2026-06-15')
  })

  it('crosses a month boundary', () => {
    expect(addDays('2026-06-30', 1)).toBe('2026-07-01')
  })

  it('crosses a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('is unaffected by a DST transition, because it is plain calendar arithmetic', () => {
    // 29 March 2026 is the UK spring forward. The day after 28 March is 29
    // March regardless of what the clocks did, which is exactly why this is
    // done on the date and the timezone is applied afterwards.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
  })
})

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-06-14', '2026-06-15')).toBe(1)
  })

  it('is zero for the same date', () => {
    expect(daysBetween('2026-06-14', '2026-06-14')).toBe(0)
  })

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-06-15', '2026-06-14')).toBe(-1)
  })

  it('counts across a month boundary', () => {
    expect(daysBetween('2026-06-30', '2026-07-02')).toBe(2)
  })

  it('is the inverse of addDays', () => {
    // The pair the day item move relies on: shift a date forward, and the gap
    // back to the original is the same offset.
    expect(daysBetween('2026-06-14', addDays('2026-06-14', 10))).toBe(10)
  })
})
