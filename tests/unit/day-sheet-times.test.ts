import { describe, it, expect } from 'vitest'
import { resolveDayOffsets, addDays } from '@/lib/schedule/day-sheet-times'

// A tour day is a working period, not a calendar day. These pin down where the
// line falls, because there is no obviously correct roll-over rule and two
// plausible ones are wrong in ways that are invisible until a TM notices a meal
// or a lobby call on the wrong morning.
//
// The shape of every case: give the day sheet a realistic running order, then
// assert which times landed on the following calendar day. Offset 0 is the
// show's own date, offset 1 is the morning after.

describe('resolveDayOffsets', () => {
  it('rolls a curfew in the small hours onto the next morning', () => {
    const offsets = resolveDayOffsets({
      load_in: '10:00',
      doors: '19:00',
      headliner_on: '21:00',
      headliner_off: '23:00',
      curfew: '01:30',
    })

    expect(offsets.headliner_off).toBe(0)
    expect(offsets.curfew).toBe(1)
  })

  it('keeps load-out on the same morning as the curfew before it', () => {
    // The accumulate-rather-than-reset case. 03:00 is later than the 01:30
    // curfew, so it has not crossed midnight a second time.
    const offsets = resolveDayOffsets({
      doors: '19:00',
      curfew: '01:30',
      load_out: '03:00',
    })

    expect(offsets.curfew).toBe(1)
    expect(offsets.load_out).toBe(1)
  })

  it('leaves an evening that never crosses midnight alone', () => {
    const offsets = resolveDayOffsets({
      doors: '19:00',
      support_off: '20:30',
      headliner_on: '21:00',
      headliner_off: '22:45',
      curfew: '23:00',
      load_out: '23:59',
    })

    for (const field of ['support_off', 'headliner_on', 'headliner_off', 'curfew', 'load_out']) {
      expect(offsets[field]).toBe(0)
    }
  })

  it('never moves a 05:00 lobby call, which is the case every cutoff rule gets wrong', () => {
    // The brief names this as the case to test first. A fixed cutoff hour of
    // 06:00 pushes an early lobby call onto the next day; it is a morning
    // event on the show day, and the TM leaving for an early flight is not
    // doing it tomorrow.
    const offsets = resolveDayOffsets({
      lobby_call: '05:00',
      load_in: '10:00',
      doors: '19:00',
      curfew: '01:30',
    })

    expect(offsets.lobby_call ?? 0).toBe(0)
    expect(offsets.curfew).toBe(1)
  })

  it('never moves an early festival load-in either', () => {
    const offsets = resolveDayOffsets({
      venue_access: '04:30',
      load_in: '05:00',
      doors: '11:00',
    })

    expect(offsets.venue_access ?? 0).toBe(0)
    expect(offsets.load_in ?? 0).toBe(0)
  })

  it('keeps a festival daytime set on the show day', () => {
    // Anchoring on this show's latest daytime time rather than on a constant
    // hour is the whole reason this works: every one of these is earlier than
    // a normal show's doors, and none of them has crossed midnight.
    const offsets = resolveDayOffsets({
      load_in: '06:00',
      doors: '10:00',
      support_on: '11:00',
      support_off: '11:30',
      changeover: '11:45',
      headliner_on: '12:00',
      headliner_off: '13:00',
      curfew: '23:00',
    })

    for (const field of ['support_off', 'changeover', 'headliner_on', 'headliner_off', 'curfew']) {
      expect(offsets[field]).toBe(0)
    }
  })

  it('does not let a late load-out drag breakfast onto the next morning', () => {
    // The reason the field list is not run through in order. Catering sits at
    // the end of DAY_SHEET_TIME_FIELDS, after load_out, so a single sequential
    // pass would read breakfast at 07:00 as "later than the 02:00 load-out,
    // therefore the same day" and serve it the morning after the show.
    const offsets = resolveDayOffsets({
      catering_breakfast_start: '07:00',
      catering_lunch_start: '12:30',
      catering_dinner_start: '17:00',
      doors: '19:00',
      curfew: '01:00',
      load_out: '02:00',
    })

    expect(offsets.catering_breakfast_start ?? 0).toBe(0)
    expect(offsets.catering_lunch_start ?? 0).toBe(0)
    expect(offsets.catering_dinner_start ?? 0).toBe(0)
    expect(offsets.curfew).toBe(1)
    expect(offsets.load_out).toBe(1)
  })

  it('rolls a lone curfew using the fallback anchor', () => {
    // A day sheet with an evening time and nothing in the daytime to anchor
    // against. Without the fallback this would take face value and store 01:30
    // twenty hours before the show, which is the original bug.
    const offsets = resolveDayOffsets({ curfew: '01:30' })
    expect(offsets.curfew).toBe(1)
  })

  it('anchors on the latest daytime time, not on a named field', () => {
    // No doors on this sheet at all. The anchor has to be whatever the TM has
    // actually filled in, because a half-completed day sheet is the normal
    // state of one.
    const offsets = resolveDayOffsets({ soundcheck: '15:00', curfew: '02:00' })
    expect(offsets.curfew).toBe(1)
  })

  it('reports nothing for a field with no time', () => {
    const offsets = resolveDayOffsets({ doors: '19:00', curfew: null, load_out: undefined })
    expect(offsets.curfew).toBeUndefined()
    expect(offsets.load_out).toBeUndefined()
  })

  it('treats midnight itself as having crossed', () => {
    // 00:00 is earlier than any evening time, so it is the following day. Worth
    // pinning because 0 is the one minute value that is falsy.
    const offsets = resolveDayOffsets({ doors: '19:00', curfew: '00:00' })
    expect(offsets.curfew).toBe(1)
  })
})

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
