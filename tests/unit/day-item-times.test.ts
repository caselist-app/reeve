import { describe, it, expect } from 'vitest'
import { resolveItemDayOffsets, type DayItemClock } from '@/lib/schedule/day-item-times'
import { resolveDayOffsets } from '@/lib/schedule/day-sheet-times'

// Brief 42 step 2. resolveItemDayOffsets replaces resolveDayOffsets for rows.
//
// The first block is every one of the old function's eleven assertions, carried
// across unchanged in meaning. That is the point of this file: Brief 40's rule is
// not being reopened, only the shape of the thing it reads. If one of these
// fails, the rule has changed and that is a decision nobody took.
//
// The second block is the cases rows can produce and columns could not: two
// items of one kind, and a catering window whose end is the latest daytime time.
//
// A tour day is a working period, not a calendar day. Offset 0 is the day's own
// date, offset 1 is the morning after.

let nextId = 0

// Ids are generated rather than written out, because they carry no meaning here
// and hand-written ones would invite assertions on the id instead of on the
// offset. Each helper returns the item so a test can hold onto its id.
function item(kind: string, clock: string | null, endClock?: string | null): DayItemClock {
  return { id: `item-${++nextId}`, kind, clock, endClock }
}

// Offsets keyed by kind, for the ported assertions. Only safe because none of
// those cases has two items of one kind, which is exactly what the old function
// could not express. The row-only block below asserts on ids directly.
function offsetsByKind(items: DayItemClock[]): Record<string, number> {
  const byId = resolveItemDayOffsets(items)
  const out: Record<string, number> = {}
  for (const i of items) {
    if (byId[i.id] !== undefined) out[i.kind] = byId[i.id]
  }
  return out
}

describe('resolveItemDayOffsets carries Brief 40 across unchanged', () => {
  it('rolls a curfew in the small hours onto the next morning', () => {
    const offsets = offsetsByKind([
      item('load_in', '10:00'),
      item('doors', '19:00'),
      item('headliner_on', '21:00'),
      item('headliner_off', '23:00'),
      item('curfew', '01:30'),
    ])

    expect(offsets.headliner_off).toBe(0)
    expect(offsets.curfew).toBe(1)
  })

  it('keeps load-out on the same morning as the curfew before it', () => {
    // The accumulate-rather-than-reset case. 03:00 is later than the 01:30
    // curfew, so it has not crossed midnight a second time.
    const offsets = offsetsByKind([
      item('doors', '19:00'),
      item('curfew', '01:30'),
      item('load_out', '03:00'),
    ])

    expect(offsets.curfew).toBe(1)
    expect(offsets.load_out).toBe(1)
  })

  it('leaves an evening that never crosses midnight alone', () => {
    const offsets = offsetsByKind([
      item('doors', '19:00'),
      item('support_off', '20:30'),
      item('headliner_on', '21:00'),
      item('headliner_off', '22:45'),
      item('curfew', '23:00'),
      item('load_out', '23:59'),
    ])

    for (const kind of ['support_off', 'headliner_on', 'headliner_off', 'curfew', 'load_out']) {
      expect(offsets[kind]).toBe(0)
    }
  })

  it('never moves a 05:00 lobby call, which is the case every cutoff rule gets wrong', () => {
    const offsets = offsetsByKind([
      item('lobby_call', '05:00'),
      item('load_in', '10:00'),
      item('doors', '19:00'),
      item('curfew', '01:30'),
    ])

    expect(offsets.lobby_call ?? 0).toBe(0)
    expect(offsets.curfew).toBe(1)
  })

  it('never moves an early festival load-in either', () => {
    const offsets = offsetsByKind([
      item('venue_access', '04:30'),
      item('load_in', '05:00'),
      item('doors', '11:00'),
    ])

    expect(offsets.venue_access ?? 0).toBe(0)
    expect(offsets.load_in ?? 0).toBe(0)
  })

  it('keeps a festival daytime set on the show day', () => {
    // Anchoring on this day's latest daytime time rather than on a constant hour
    // is the whole reason this works: every one of these is earlier than a normal
    // show's doors, and none has crossed midnight.
    const offsets = offsetsByKind([
      item('load_in', '06:00'),
      item('doors', '10:00'),
      item('support_on', '11:00'),
      item('support_off', '11:30'),
      item('changeover', '11:45'),
      item('headliner_on', '12:00'),
      item('headliner_off', '13:00'),
      item('curfew', '23:00'),
    ])

    for (const kind of ['support_off', 'changeover', 'headliner_on', 'headliner_off', 'curfew']) {
      expect(offsets[kind]).toBe(0)
    }
  })

  it('does not let a late load-out drag breakfast onto the next morning', () => {
    // Catering is three items now rather than six columns, so this is the same
    // case in the new shape.
    const offsets = offsetsByKind([
      item('catering_breakfast', '07:00'),
      item('catering_lunch', '12:30'),
      item('catering_dinner', '17:00'),
      item('doors', '19:00'),
      item('curfew', '01:00'),
      item('load_out', '02:00'),
    ])

    expect(offsets.catering_breakfast ?? 0).toBe(0)
    expect(offsets.catering_lunch ?? 0).toBe(0)
    expect(offsets.catering_dinner ?? 0).toBe(0)
    expect(offsets.curfew).toBe(1)
    expect(offsets.load_out).toBe(1)
  })

  it('rolls a lone curfew using the fallback anchor', () => {
    // Nothing in the daytime to anchor against. Without the fallback this would
    // take face value and store 01:30 twenty hours before the show, which is the
    // original bug.
    const offsets = offsetsByKind([item('curfew', '01:30')])
    expect(offsets.curfew).toBe(1)
  })

  it('anchors on the latest daytime time, not on a named field', () => {
    const offsets = offsetsByKind([item('soundcheck', '15:00'), item('curfew', '02:00')])
    expect(offsets.curfew).toBe(1)
  })

  it('reports nothing for an item with no time', () => {
    const doors = item('doors', '19:00')
    const curfew = item('curfew', null)
    const byId = resolveItemDayOffsets([doors, curfew])

    expect(byId[curfew.id]).toBeUndefined()
    expect(byId[doors.id]).toBeUndefined()
  })

  it('treats midnight itself as having crossed', () => {
    // 00:00 is earlier than any evening time, so it is the following day. Worth
    // pinning because 0 is the one minute value that is falsy.
    const offsets = offsetsByKind([item('doors', '19:00'), item('curfew', '00:00')])
    expect(offsets.curfew).toBe(1)
  })
})

describe('resolveItemDayOffsets agrees with the function it replaces', () => {
  // Belt and braces on the port. The same running order through both functions
  // has to produce the same answer, so a future edit to one that changes the
  // rule cannot pass while the other still holds it. Removed when day_sheets
  // goes, along with the old function.
  const RUNNING_ORDERS: Record<string, string>[] = [
    { load_in: '10:00', doors: '19:00', headliner_off: '23:00', curfew: '01:30' },
    { doors: '19:00', curfew: '01:30', load_out: '03:00' },
    { lobby_call: '05:00', load_in: '10:00', doors: '19:00', curfew: '01:30' },
    { load_in: '06:00', doors: '10:00', support_off: '11:30', curfew: '23:00' },
    { soundcheck: '15:00', curfew: '02:00' },
    { curfew: '01:30' },
    { doors: '19:00', curfew: '00:00' },
  ]

  it.each(RUNNING_ORDERS)('matches resolveDayOffsets for %o', (order) => {
    const old = resolveDayOffsets(order)
    const now = offsetsByKind(Object.entries(order).map(([kind, clock]) => item(kind, clock)))

    // Compared as full maps rather than field by field, so an extra or missing
    // entry fails too.
    expect(now).toEqual(old)
  })
})

describe('resolveItemDayOffsets handles what rows can express and columns could not', () => {
  it('gives two items of the same kind their own offsets', () => {
    // The change that makes the old signature impossible rather than awkward. A
    // map keyed by kind would lose one of these.
    const first = item('soundcheck', '15:00')
    const second = item('soundcheck', '17:00')
    const curfew = item('curfew', '01:00')

    const byId = resolveItemDayOffsets([first, second, curfew])

    // Both soundchecks are daytime, so neither gets an offset, and the later of
    // the two is the anchor: 01:00 is before 17:00, so the curfew rolled.
    expect(byId[first.id]).toBeUndefined()
    expect(byId[second.id]).toBeUndefined()
    expect(byId[curfew.id]).toBe(1)
  })

  it('walks two load-outs in clock order, not insertion order', () => {
    // 23:30 then 00:30 crosses midnight once. Passed in the wrong order to prove
    // the sort is doing the work rather than the caller.
    const after = item('load_out', '00:30')
    const before = item('load_out', '23:30')

    const byId = resolveItemDayOffsets([item('doors', '19:00'), after, before])

    expect(byId[before.id]).toBe(0)
    expect(byId[after.id]).toBe(1)
  })

  it('anchors on the end of a catering window, not just its start', () => {
    // The second thing rows changed. A dinner from 18:00 to 19:30 means the
    // latest daytime time is 19:30, so the anchor is 19:30 and not 18:00.
    //
    // The assertion is 1 rather than 0, and that is the inherited behaviour
    // rather than a choice made here: catering_dinner_end was in DAYTIME_FIELDS,
    // so the old function anchored on 19:30 too and rolled a 19:00 curfew the
    // same way. Reading the start alone would give 0, which is why this proves
    // the end is read.
    //
    // A curfew before the end of dinner is not a real running order, which is why
    // this has never mattered in production. Pinned so that changing it is a
    // decision about Brief 40 rather than a side effect of touching this file.
    const curfew = item('curfew', '19:00')
    const byId = resolveItemDayOffsets([item('catering_dinner', '18:00', '19:30'), curfew])

    expect(byId[curfew.id]).toBe(1)

    // The same curfew with the window's end removed does not roll, which is the
    // half that makes the assertion above about the end time specifically.
    const control = item('curfew', '19:00')
    expect(
      resolveItemDayOffsets([item('catering_dinner', '18:00', null), control])[control.id],
    ).toBe(0)
  })

  it('still rolls a genuine small-hours curfew when catering is the only anchor', () => {
    // The inverse of the case above, so it cannot pass by never rolling.
    const curfew = item('curfew', '01:30')
    const byId = resolveItemDayOffsets([item('catering_dinner', '18:00', '19:30'), curfew])

    expect(byId[curfew.id]).toBe(1)
  })

  it('ignores an end time on a crossing item when anchoring', () => {
    // A crossing kind never contributes to the anchor, whichever end is read.
    // Otherwise a load-out window ending at 04:00 would anchor the day at 04:00
    // and nothing would ever roll.
    const curfew = item('curfew', '01:30')
    const byId = resolveItemDayOffsets([item('load_out', '02:00', '04:00'), curfew])

    expect(byId[curfew.id]).toBe(1)
  })

  it('does not let an unknown kind join the evening walk', () => {
    // A kind the database allows and this build does not know is a bug, and the
    // safe direction is to leave it on the day's own date rather than guess that
    // it crossed midnight.
    const unknown = item('press_call', '01:00')
    const byId = resolveItemDayOffsets([item('doors', '19:00'), unknown])

    expect(byId[unknown.id]).toBeUndefined()
  })

  it('leaves a custom item on the day, even in the small hours', () => {
    // 'other' has crossesMidnight false, which preserves exactly what day_events
    // does today. The cost is named in the kind list: an after-show party typed
    // as 1am lands at 01:00 that morning. Pinned so changing it is a decision.
    const party = item('other', '01:00')
    const byId = resolveItemDayOffsets([item('doors', '19:00'), party])

    expect(byId[party.id]).toBeUndefined()
  })

  it('returns nothing at all for an empty day', () => {
    expect(resolveItemDayOffsets([])).toEqual({})
  })
})
