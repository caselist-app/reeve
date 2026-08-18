import { describe, it, expect } from 'vitest'
import {
  DAY_START_HOUR,
  localBroadcastDateInZone,
  localBroadcastDayWindowUtc,
  toGridInstant,
  fromGridInstant,
  broadcastDateForClock,
  broadcastDateOfWallClock,
} from '@/lib/schedule/day-window'
import {
  localDateInZone,
  localDayWindowUtc,
  localTimeInZone,
  wallClockToUtc,
} from '@/lib/schedule/datetime'

// Step 1 of the broadcast-day grid: the pure day-window and grid-shift
// primitives, with no UI or fetch attached yet. Every expectation here is a
// wall-clock fact about a real zone, not a restatement of the implementation.
//
// The three zones cover the cases that historically diverge: a tour on UTC, one
// east of it (Auckland, where the local clock is already the next date by
// evening) and one west (Los Angeles). These use June and December, stable in
// all three zones, so the shift is a clean four hours. The DST-transition cases,
// where it is not, are the final describe block (REE-116).

const DATE = '2026-06-14'
const ZONES = ['UTC', 'Pacific/Auckland', 'America/Los_Angeles']
const HOUR_MS = 3_600_000

// The synthetic grid is the tour-local calendar day [dayDate 00:00, +1 00:00),
// which is exactly what localDayWindowUtc already returns. Used here as an
// independent oracle for where the grid opens and closes in each zone.
const gridStartMs = (tz: string) => new Date(localDayWindowUtc(DATE, tz).start).getTime()
const gridEndMs = (tz: string) => new Date(localDayWindowUtc(DATE, tz).end).getTime()

function inGridDay(iso: string, tz: string): boolean {
  const t = new Date(iso).getTime()
  return t >= gridStartMs(tz) && t < gridEndMs(tz)
}

describe('DAY_START_HOUR', () => {
  it('is 04:00, the documented broadcast-day boundary', () => {
    expect(DAY_START_HOUR).toBe(4)
  })
})

describe('localBroadcastDayWindowUtc', () => {
  it('spans dayDate 04:00 to next date 04:00 for a UTC tour', () => {
    const { start, end } = localBroadcastDayWindowUtc(DATE, 'UTC')
    expect(start).toBe('2026-06-14T04:00:00.000Z')
    expect(end).toBe('2026-06-15T04:00:00.000Z')
  })

  it('resolves the boundary in the tour zone, east of UTC (Auckland, UTC+12)', () => {
    // 04:00 on 14 June in Auckland is 16:00Z on 13 June.
    const { start, end } = localBroadcastDayWindowUtc(DATE, 'Pacific/Auckland')
    expect(start).toBe('2026-06-13T16:00:00.000Z')
    expect(end).toBe('2026-06-14T16:00:00.000Z')
  })

  it('resolves the boundary in the tour zone, west of UTC (Los Angeles, UTC-7 in June)', () => {
    // 04:00 on 14 June in Los Angeles (PDT) is 11:00Z the same date.
    const { start, end } = localBroadcastDayWindowUtc(DATE, 'America/Los_Angeles')
    expect(start).toBe('2026-06-14T11:00:00.000Z')
    expect(end).toBe('2026-06-15T11:00:00.000Z')
  })

  it('opens the broadcast window DAY_START_HOUR hours after grid midnight', () => {
    for (const tz of ZONES) {
      const broadcastStart = new Date(localBroadcastDayWindowUtc(DATE, tz).start).getTime()
      expect(broadcastStart - gridStartMs(tz)).toBe(DAY_START_HOUR * HOUR_MS)
    }
  })
})

describe('toGridInstant places a full night onto one calendar-day grid', () => {
  // A 21:00 show, a 01:00 curfew and a 02:00 drive: the last two fall on the
  // next calendar date, but all three belong to 14 June's broadcast night.
  const cases = [
    {
      tz: 'UTC',
      show: '2026-06-14T21:00:00.000Z',
      curfew: '2026-06-15T01:00:00.000Z',
      drive: '2026-06-15T02:00:00.000Z',
    },
    {
      tz: 'Pacific/Auckland',
      // Auckland wall-clock times converted to UTC (UTC+12 in June).
      show: '2026-06-14T09:00:00.000Z', // 21:00 NZST
      curfew: '2026-06-14T13:00:00.000Z', // 01:00 next date NZST
      drive: '2026-06-14T14:00:00.000Z', // 02:00 next date NZST
    },
    {
      tz: 'America/Los_Angeles',
      // Los Angeles wall-clock times converted to UTC (UTC-7 PDT in June).
      show: '2026-06-15T04:00:00.000Z', // 21:00 PDT
      curfew: '2026-06-15T08:00:00.000Z', // 01:00 next date PDT
      drive: '2026-06-15T09:00:00.000Z', // 02:00 next date PDT
    },
  ]

  for (const { tz, show, curfew, drive } of cases) {
    it(`maps show, curfew and drive into the grid day, in order (${tz})`, () => {
      const g = (iso: string) => toGridInstant(iso, tz)
      const gShow = g(show)
      const gCurfew = g(curfew)
      const gDrive = g(drive)

      expect(inGridDay(gShow, tz)).toBe(true)
      expect(inGridDay(gCurfew, tz)).toBe(true)
      expect(inGridDay(gDrive, tz)).toBe(true)

      // Order is preserved by a constant shift, and the tail sits after the show.
      expect(new Date(gShow).getTime()).toBeLessThan(new Date(gCurfew).getTime())
      expect(new Date(gCurfew).getTime()).toBeLessThan(new Date(gDrive).getTime())
    })

    it(`drops a 21:00 show 17 hours down the grid (21:00 - 04:00) (${tz})`, () => {
      const gridShow = new Date(toGridInstant(show, tz)).getTime()
      // Offset from the top of the grid is the show's clock time minus 04:00.
      expect(gridShow - gridStartMs(tz)).toBe(17 * HOUR_MS)
    })
  }
})

describe('toGridInstant shifts the broadcast start to grid midnight', () => {
  it('maps DAY_START_HOUR local onto the top of the grid in each zone', () => {
    for (const tz of ZONES) {
      const broadcastStart = localBroadcastDayWindowUtc(DATE, tz).start
      expect(new Date(toGridInstant(broadcastStart, tz)).getTime()).toBe(gridStartMs(tz))
    }
  })
})

describe('broadcast-day boundary: 03:59 versus 04:00', () => {
  // The instant at exactly DAY_START_HOUR opens the day; one minute before it
  // still belongs to the previous broadcast day and lands just above the grid.
  for (const tz of ZONES) {
    it(`04:00 opens 14 June's window, 03:59 falls in the previous one (${tz})`, () => {
      const { start, end } = localBroadcastDayWindowUtc(DATE, tz)
      const at0400 = new Date(start).getTime() // window start is exactly 04:00 local
      const at0359 = at0400 - 60_000

      // 04:00 is in [start, end); 03:59 is before start (previous day).
      expect(at0400 >= new Date(start).getTime() && at0400 < new Date(end).getTime()).toBe(true)
      expect(at0359 < new Date(start).getTime()).toBe(true)

      // 04:00 maps to the very top of the grid; 03:59 maps one minute above it.
      expect(new Date(toGridInstant(start, tz)).getTime()).toBe(gridStartMs(tz))
      expect(
        new Date(toGridInstant(new Date(at0359).toISOString(), tz)).getTime(),
      ).toBe(gridStartMs(tz) - 60_000)
    })
  }
})

describe('localBroadcastDateInZone', () => {
  // Which broadcast night a real instant belongs to. This is what a segment drag
  // files by (REE-115): a same-night cross-midnight drag keeps its day, and only
  // a drop past 04:00 moves it. Built with wallClockToUtc so each case is a
  // wall-clock fact in the zone, read back the way the action does.
  const NEXT = '2026-06-15'

  for (const tz of ZONES) {
    it(`keeps an evening departure on its own date (${tz})`, () => {
      expect(localBroadcastDateInZone(wallClockToUtc(`${DATE}T22:00`, tz), tz)).toBe(DATE)
    })

    it(`keeps a small-hours instant on the previous night (${tz})`, () => {
      // 01:30 on the 15th is the tail of the 14th's broadcast night.
      expect(localBroadcastDateInZone(wallClockToUtc(`${NEXT}T01:30`, tz), tz)).toBe(DATE)
    })

    it(`opens the new broadcast day at exactly 04:00 (${tz})`, () => {
      expect(localBroadcastDateInZone(wallClockToUtc(`${NEXT}T04:00`, tz), tz)).toBe(NEXT)
    })

    it(`moves an instant past 04:00 onto the adjacent day (${tz})`, () => {
      // 05:00 on the 15th is past the boundary: it is genuinely the 15th's day.
      expect(localBroadcastDateInZone(wallClockToUtc(`${NEXT}T05:00`, tz), tz)).toBe(NEXT)
    })

    it(`treats 03:59 as the previous night, one minute before the boundary (${tz})`, () => {
      expect(localBroadcastDateInZone(wallClockToUtc(`${NEXT}T03:59`, tz), tz)).toBe(DATE)
    })
  }
})

describe('broadcastDateForClock', () => {
  // REE-280: the drive and rail add forms seed a departure from the viewed
  // broadcast day plus a bare 'HH:MM' clock. A clock before DAY_START_HOUR is
  // the tail of that night, so it must land on the following calendar date, not
  // the viewed day's own date.
  it('keeps an evening clock on the viewed date', () => {
    expect(broadcastDateForClock(DATE, '22:00')).toBe(DATE)
  })

  it('rolls a small-hours clock onto the following date', () => {
    expect(broadcastDateForClock(DATE, '01:30')).toBe('2026-06-15')
  })

  it('opens the following date at exactly DAY_START_HOUR', () => {
    expect(broadcastDateForClock(DATE, '04:00')).toBe(DATE)
  })

  it('treats 03:59 as the tail of the viewed night', () => {
    expect(broadcastDateForClock(DATE, '03:59')).toBe('2026-06-15')
  })
})

describe('broadcastDateOfWallClock is the inverse of broadcastDateForClock', () => {
  it('reads an evening departure back onto its own date', () => {
    expect(broadcastDateOfWallClock(`${DATE}T22:00`)).toBe(DATE)
  })

  it('reads a small-hours departure back onto the broadcast night before it', () => {
    // A drive seeded for 01:30 sits on 2026-06-15 (the calendar date), which
    // belongs to 2026-06-14's broadcast night.
    expect(broadcastDateOfWallClock('2026-06-15T01:30')).toBe(DATE)
  })

  it('round-trips broadcastDateForClock for a small-hours clock', () => {
    const clock = '01:30'
    const seeded = `${broadcastDateForClock(DATE, clock)}T${clock}`
    expect(broadcastDateOfWallClock(seeded)).toBe(DATE)
  })

  it('round-trips broadcastDateForClock for an evening clock', () => {
    const clock = '22:00'
    const seeded = `${broadcastDateForClock(DATE, clock)}T${clock}`
    expect(broadcastDateOfWallClock(seeded)).toBe(DATE)
  })
})

describe('fromGridInstant is the exact inverse of toGridInstant', () => {
  const instants = [
    '2026-06-14T21:00:00.000Z',
    '2026-06-15T01:00:00.000Z',
    '2026-06-15T02:30:00.000Z',
    '2026-06-14T04:00:00.000Z',
    '2026-12-14T23:45:00.000Z',
  ]

  for (const tz of ZONES) {
    for (const iso of instants) {
      it(`round-trips ${iso} in ${tz}`, () => {
        expect(fromGridInstant(toGridInstant(iso, tz), tz)).toBe(iso)
      })
    }
  }
})

// REE-116. The shift is DAY_START_HOUR hours of WALL CLOCK, not a fixed elapsed
// gap, so a transition inside the broadcast window does not throw a block off its
// label. Europe/London springs forward 2026-03-29 (01:00 -> 02:00, a 23-hour
// broadcast night when the transition is in the tail) and falls back 2026-10-25
// (02:00 -> 01:00, a 25-hour one). Each fact below is a wall-clock statement:
// where a real instant lands on the grid, read as a tour-local time. The retired
// fixed-offset shift subtracted the view date's own 00:00-to-04:00 gap (three or
// five real hours across the change) as one constant, so every block on the far
// side of the transition came out an hour wrong; these pin the corrected value.
describe('toGridInstant across a DST transition (wall-clock shift)', () => {
  const LONDON = 'Europe/London'

  // Both directions, both viewed-date positions relative to the change.
  const cases = [
    {
      name: 'spring-forward day: transition before the 04:00 start, clean window',
      viewedDate: '2026-03-29',
      realWall: '2026-03-29T21:00', // a 21:00 show, post-transition BST
      expectGridDate: '2026-03-29',
      expectGridTime: '17:00', // 21:00 - 04:00
    },
    {
      name: 'spring-forward tail: transition inside the previous night (23h window)',
      viewedDate: '2026-03-28',
      realWall: '2026-03-29T02:30', // a 02:30 curfew on the next date
      expectGridDate: '2026-03-28',
      expectGridTime: '22:30', // broadcast-wall 26:30 -> grid 22:30
    },
    {
      name: 'fall-back day: transition before the 04:00 start, clean window',
      viewedDate: '2026-10-25',
      realWall: '2026-10-25T21:00', // a 21:00 show, post-transition GMT
      expectGridDate: '2026-10-25',
      expectGridTime: '17:00',
    },
    {
      name: 'fall-back tail: transition inside the previous night (25h window)',
      viewedDate: '2026-10-24',
      realWall: '2026-10-25T03:00', // a 03:00 lobby call on the next date
      expectGridDate: '2026-10-24',
      expectGridTime: '23:00', // broadcast-wall 27:00 -> grid 23:00
    },
  ]

  for (const { name, realWall, expectGridDate, expectGridTime } of cases) {
    it(name, () => {
      const real = wallClockToUtc(realWall, LONDON)
      const grid = toGridInstant(real, LONDON)

      // The grid instant reads at the broadcast wall clock minus four hours, on
      // the day the grid renders. This is what RBC positions a block by.
      expect(localDateInZone(grid, LONDON)).toBe(expectGridDate)
      expect(localTimeInZone(grid, LONDON)).toBe(expectGridTime)

      // Unambiguous wall clocks on both ends, so the inverse is exact even here.
      expect(fromGridInstant(grid, LONDON)).toBe(real)
    })
  }

  it('maps the broadcast start onto grid midnight on a transition day', () => {
    // The window opens at 04:00 local whatever the offset is doing; it must still
    // land on the top of the grid (the view date's local 00:00).
    for (const viewedDate of ['2026-03-29', '2026-10-25']) {
      const broadcastStart = localBroadcastDayWindowUtc(viewedDate, LONDON).start
      expect(toGridInstant(broadcastStart, LONDON)).toBe(localDayWindowUtc(viewedDate, LONDON).start)
    }
  })
})
