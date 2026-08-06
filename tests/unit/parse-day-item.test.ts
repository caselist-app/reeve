import { describe, it, expect } from 'vitest'
import { parseDayItem } from '@/lib/schedule/parse-day-item'

// REE-21. parseDayItem turns one typed line into a kind, a title and a wall
// clock range. Deterministic, no model call.
//
// It returns HH:MM strings, NOT instants, and takes neither a date nor a
// timezone. Which calendar day 01:30 falls on depends on the rest of the day,
// and resolveItemDayOffsets owns that rule with the whole day in hand. A pure
// parser sees one line, so it cannot build the instant and does not try. The
// header of lib/validators/day-item.ts is the reasoning; there are no timezone
// assertions here because the parser never sees one.
//
// The rows below are the brief's case table. The four assertions the issue
// calls out by name (3-4pm not 03:00, explicit meridiem winning, an end before
// a start rejected not swapped, a time-less load line) each get their own block.

describe('parseDayItem: the brief case table', () => {
  it('reads a band name, a kind and a range off one line', () => {
    const { best } = parseDayItem('Tesseract sound is from 3-4pm')
    expect(best.kind).toBe('soundcheck')
    expect(best.title).toBe('Tesseract')
    expect(best.startClock).toBe('15:00')
    expect(best.endClock).toBe('16:00')
  })

  it('keeps meet and greet as a titled custom item, not VIP', () => {
    // The kind list deliberately does not alias 'meet and greet' to VIP, so an
    // unknown phrase lands on 'other' and the whole phrase becomes the title.
    const { best } = parseDayItem('meet and greet 5.30pm')
    expect(best.kind).toBe('other')
    expect(best.title).toBe('Meet and greet')
    expect(best.startClock).toBe('17:30')
    expect(best.endClock).toBeNull()
  })

  it("resolves 'load 2' to 14:00 on the load-in default meridiem", () => {
    const { best } = parseDayItem('load 2')
    expect(best.kind).toBe('load_in')
    expect(best.startClock).toBe('14:00')
    expect(best.endClock).toBeNull()
    expect(best.title).toBeNull()
  })

  it("resolves 'curfew 11' to 23:00", () => {
    const { best } = parseDayItem('curfew 11')
    expect(best.kind).toBe('curfew')
    expect(best.startClock).toBe('23:00')
  })

  it("resolves 'lobby 5' to 05:00 on the lobby-call am default", () => {
    const { best } = parseDayItem('lobby 5')
    expect(best.kind).toBe('lobby_call')
    expect(best.startClock).toBe('05:00')
  })
})

describe('parseDayItem: meridiem', () => {
  it("reads '3-4pm' as 15:00 to 16:00, never 03:00", () => {
    const { best } = parseDayItem('3-4pm')
    expect(best.startClock).toBe('15:00')
    expect(best.endClock).toBe('16:00')
    expect(best.startClock).not.toBe('03:00')
  })

  it('lets an explicit meridiem beat the kind default', () => {
    // Lobby call defaults to am, so a naive parser would read 3 as 03:00. The
    // explicit pm on the range end applies to both ends and wins.
    const { best } = parseDayItem('lobby 3-4pm')
    expect(best.kind).toBe('lobby_call')
    expect(best.startClock).toBe('15:00')
    expect(best.endClock).toBe('16:00')
    expect(best.startClock).not.toBe('03:00')
  })
})

describe('parseDayItem: an end before a start', () => {
  it('rejects the end rather than swapping it', () => {
    // 4-3pm is 16:00 to 15:00. The parser must not silently reorder it into a
    // valid-looking 15:00 to 16:00. It keeps the start and drops the bad end.
    const { best } = parseDayItem('soundcheck 4-3pm')
    expect(best.startClock).toBe('16:00')
    expect(best.endClock).toBeNull()
    expect(best.startClock).not.toBe('15:00')
  })
})

describe('parseDayItem: a line with no time', () => {
  it("returns a kind and a null start rather than failing", () => {
    // day_items.starts_at is nullable, so an item with no time is a real thing.
    const { best } = parseDayItem('load')
    expect(best.kind).toBe('load_in')
    expect(best.startClock).toBeNull()
    expect(best.endClock).toBeNull()
    expect(best.missing).toContain('startClock')
  })
})

describe('parseDayItem: ranking', () => {
  it('is confident about an exact alias match', () => {
    const { best } = parseDayItem('soundcheck 2pm')
    expect(best.kind).toBe('soundcheck')
    expect(best.confidence).toBeGreaterThan(0.5)
  })

  it("offers 'other' as a fallback alternative for a matched kind", () => {
    // The combo box always needs an escape hatch to a custom item, whatever the
    // parser guessed.
    const { alternatives } = parseDayItem('soundcheck 2pm')
    expect(alternatives.some((candidate) => candidate.kind === 'other')).toBe(true)
  })

  it('prefers the longer, more specific alias', () => {
    // 'load out' must beat the bare 'load' that load-in also answers to.
    const { best } = parseDayItem('load out 6pm')
    expect(best.kind).toBe('load_out')
    expect(best.startClock).toBe('18:00')
  })
})
