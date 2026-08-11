import { describe, it, expect } from 'vitest'
import {
  DAY_ITEM_KINDS,
  DAY_ITEM_KIND_NAMES,
  dayItemKind,
  dayItemLabel,
} from '@/lib/schedule/day-item-kinds'

// Brief 42 step 2. The kind list is the single source of truth for what can be
// on a day, so the things that make it correct are not visible by reading it.
// Two of them in particular:
//
//   1. The ORDER of the crossesMidnight kinds is load bearing. The roll-over in
//      resolveItemDayOffsets walks them in sequence and treats the clock going
//      backwards as evidence of midnight. Reordering them looks cosmetic and
//      silently breaks Brief 40.
//   2. The check constraint on day_items.kind has to hold exactly this set. That
//      one is checked by scripts/check-conventions.mjs rule 10 rather than here,
//      because it needs to read the migration.

describe('the day item kind list', () => {
  it('holds the sixteen kinds and nothing else', () => {
    // Brief 42's eighteen, minus the four on/off names, plus the two merged
    // windows headliner and support (REE-100). Written out rather than counted,
    // so adding a speculative kind fails here and has to be argued for rather
    // than slipped in.
    expect(new Set(DAY_ITEM_KIND_NAMES)).toEqual(
      new Set([
        'lobby_call',
        'venue_access',
        'load_in',
        'line_check',
        'soundcheck',
        'vip',
        'doors',
        'support',
        'changeover',
        'headliner',
        'curfew',
        'load_out',
        'catering_breakfast',
        'catering_lunch',
        'catering_dinner',
        'other',
      ]),
    )
    expect(DAY_ITEM_KINDS).toHaveLength(16)
  })

  it('has no duplicate kind', () => {
    expect(new Set(DAY_ITEM_KIND_NAMES).size).toBe(DAY_ITEM_KIND_NAMES.length)
  })

  it('keeps the crossing kinds in the order they occur', () => {
    // The sequence resolveItemDayOffsets walks. The headliner set ends before
    // the curfew, which is before the load-out. Support and the changeover are
    // evening daytime slots (REE-100, REE-120), so they anchor the day rather
    // than joining this walk. This is the assertion that makes reordering the
    // array a failing test rather than a silent bug.
    const crossing = DAY_ITEM_KINDS.filter((k) => k.crossesMidnight).map((k) => k.kind)

    expect(crossing).toEqual(['headliner', 'curfew', 'load_out'])
  })

  it('surfaces an end time in comms for catering and the two show windows', () => {
    // Decision 3, and its carve-out. Comms say 'Load-in 10:00', never a range,
    // because a load-in end is a fifteen minute estimate. Catering, and now the
    // headliner and support windows (REE-100), are the cases where the end is a
    // stated time crew care about, so the range is the point.
    const withEnd = DAY_ITEM_KINDS.filter((k) => k.surfaceEndInComms).map((k) => k.kind)

    expect(withEnd.sort()).toEqual([
      'catering_breakfast',
      'catering_dinner',
      'catering_lunch',
      'headliner',
      'support',
    ])
  })

  it('gives every catering kind the catering accent, and only those', () => {
    const catering = DAY_ITEM_KINDS.filter((k) => k.accent === 'catering').map((k) => k.kind)
    expect(catering.sort()).toEqual(['catering_breakfast', 'catering_dinner', 'catering_lunch'])
  })

  it('gives the two performance sets their own accent, unshared (REE-122)', () => {
    // Support and the headliner each carry a hue no other kind uses, so the acts
    // stand out on the day. Asserting exclusivity here is what stops a later kind
    // quietly reusing one of the two standout colours.
    expect(dayItemKind('headliner')?.accent).toBe('headliner')
    expect(dayItemKind('support')?.accent).toBe('support')
    expect(DAY_ITEM_KINDS.filter((k) => k.accent === 'headliner').map((k) => k.kind)).toEqual([
      'headliner',
    ])
    expect(DAY_ITEM_KINDS.filter((k) => k.accent === 'support').map((k) => k.kind)).toEqual([
      'support',
    ])
  })

  it('puts the custom kind last and gives it no aliases', () => {
    // The combo box offers kinds in array order and the custom option must never
    // be the highlighted default: one typo otherwise creates a permanent second
    // vocabulary, with Lod-in sitting next to Load-in forever.
    expect(DAY_ITEM_KINDS[DAY_ITEM_KINDS.length - 1].kind).toBe('other')
    expect(dayItemKind('other')?.aliases).toEqual([])
  })

  it('only lets the custom kind have no aliases', () => {
    for (const kind of DAY_ITEM_KINDS) {
      if (kind.kind === 'other') continue
      expect(kind.aliases.length).toBeGreaterThan(0)
    }
  })

  it('keeps every alias lower case, trimmed and unpunctuated by accident', () => {
    // The parser normalises input the same way, so an alias with a capital or a
    // stray space could never be matched and would be dead weight that looks
    // like coverage.
    for (const kind of DAY_ITEM_KINDS) {
      for (const alias of kind.aliases) {
        expect(alias).toBe(alias.toLowerCase())
        expect(alias).toBe(alias.trim())
        expect(alias.length).toBeGreaterThan(0)
      }
    }
  })

  it('never gives the same alias to two kinds', () => {
    // An ambiguous alias means the parser's answer depends on array order, which
    // is exactly the kind of invisible coupling this list exists to remove.
    const seen = new Map<string, string>()

    for (const kind of DAY_ITEM_KINDS) {
      for (const alias of kind.aliases) {
        const owner = seen.get(alias)
        if (owner) {
          throw new Error(`"${alias}" is claimed by both ${owner} and ${kind.kind}`)
        }
        seen.set(alias, kind.kind)
      }
    }

    expect(seen.size).toBeGreaterThan(30)
  })

  it('does not alias meet and greet to VIP', () => {
    // The brief's case table requires 'meet and greet 5.30pm' to become a custom
    // item titled Meet and greet. VIP is a different thing a TM schedules, and
    // collapsing the two would make the case table unsatisfiable.
    for (const kind of DAY_ITEM_KINDS) {
      expect(kind.aliases).not.toContain('meet and greet')
    }
  })

  it('gives every kind a label that is not just the raw kind', () => {
    for (const kind of DAY_ITEM_KINDS) {
      expect(kind.label).not.toBe(kind.kind)
      expect(kind.label.trim()).toBe(kind.label)
      expect(kind.label.length).toBeGreaterThan(0)
    }
  })
})

describe('dayItemKind', () => {
  it('finds a known kind', () => {
    expect(dayItemKind('load_in')?.label).toBe('Load-in')
  })

  it('returns undefined for a kind this build does not know', () => {
    // Deliberately not a fallback to 'other'. A row with an unknown kind means
    // the check constraint and this array have come apart, and relabelling it as
    // a custom item would hide that.
    expect(dayItemKind('press_call')).toBeUndefined()
  })
})

describe('dayItemLabel', () => {
  it('labels a known kind', () => {
    expect(dayItemLabel('curfew')).toBe('Curfew')
  })

  it('returns the raw kind for an unknown one, so it looks like the bug it is', () => {
    expect(dayItemLabel('press_call')).toBe('press_call')
  })
})
