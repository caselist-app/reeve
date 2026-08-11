import { describe, it, expect } from 'vitest'
import { buildAddOptions, ADD_CATEGORIES } from '@/lib/schedule/add-options'
import { DAY_ITEM_KINDS } from '@/lib/schedule/day-item-kinds'

// REE-87. The add-panel ranking, pulled out of the combo box so a test can reach
// it. The interesting rule is the last one below: categories match the parser's
// residual, not the raw input, which is why 'hotel 3pm' reaches Hotel as surely
// as 'hotel' does. That assertion was written red first against a version that
// matched the raw input string; 'hotel 3pm' failed there (the time made the raw
// string stop matching the 'hotel' alias) and passed once the match moved to the
// residual.
//
// Counts are derived from DAY_ITEM_KINDS rather than written down: REE-100
// already changed the number once (four on/off kinds collapsed to two windowed
// ones), and CLAUDE.md's rule is that no number about this repo lives in prose.

const KINDS_EXCEPT_OTHER = DAY_ITEM_KINDS.filter((kind) => kind.kind !== 'other')

describe('buildAddOptions', () => {
  it('offers the four categories then every kind, and no generic Custom, on empty input', () => {
    const options = buildAddOptions('', [])

    const opens = options.filter((option) => option.action === 'open')
    const commits = options.filter((option) => option.action === 'commit')

    // Exactly the four bookable categories, in BOOK order.
    expect(opens.map((option) => option.action === 'open' && option.category)).toEqual([
      'flight',
      'drive',
      'rail',
      'hotel',
    ])
    expect(opens).toHaveLength(ADD_CATEGORIES.length)

    // Then one commit row per kind, in DAY_ITEM_KINDS file order.
    expect(commits.map((option) => option.action === 'commit' && option.kind)).toEqual(
      KINDS_EXCEPT_OTHER.map((kind) => kind.kind),
    )

    // The open rows come before the commit rows.
    expect(options.slice(0, opens.length).every((option) => option.action === 'open')).toBe(true)

    // No generic Custom row at all: nothing with kind 'other'.
    expect(options.some((option) => option.action === 'commit' && option.kind === 'other')).toBe(false)
  })

  it('ranks a matched kind first and carries its parsed time', () => {
    const options = buildAddOptions('load in 10am', [])
    const first = options[0]

    expect(first.action).toBe('commit')
    if (first.action !== 'commit') throw new Error('expected a commit row')
    expect(first.kind).toBe('load_in')
    expect(first.startClock).toBe('10:00')
  })

  it('ranks a matched category first', () => {
    const options = buildAddOptions('hotel', [])
    const first = options[0]

    expect(first.action).toBe('open')
    if (first.action !== 'open') throw new Error('expected an open row')
    expect(first.category).toBe('hotel')
  })

  it('matches categories against the residual, not the raw input, so a time does not hide Hotel', () => {
    // The load-bearing assertion. 'hotel 3pm' contains a time; matched against
    // the raw string, the 'hotel' alias no longer lines up, and Hotel drops out
    // of first place. Matched against the parser's residual ('hotel', the line
    // with the time removed) it is index 0, exactly as bare 'hotel' is.
    const options = buildAddOptions('hotel 3pm', [])
    const first = options[0]

    expect(first.action).toBe('open')
    if (first.action !== 'open') throw new Error('expected an open row')
    expect(first.category).toBe('hotel')
  })

  it('ranks a typo-matched kind above the custom row (Brief 42 typo rule)', () => {
    const options = buildAddOptions('lod', [])

    const loadInIndex = options.findIndex((option) => option.action === 'commit' && option.kind === 'load_in')
    const customIndex = options.findIndex(
      (option) => option.action === 'commit' && option.kind === 'other',
    )

    expect(loadInIndex).toBeGreaterThanOrEqual(0)
    expect(customIndex).toBeGreaterThanOrEqual(0)
    expect(loadInIndex).toBeLessThan(customIndex)
  })

  it('prefix-matches: "d" surfaces both Doors and Drive, "dr" surfaces Drive and not Doors', () => {
    const forD = buildAddOptions('d', [])
    const hasDoors = (options: ReturnType<typeof buildAddOptions>) =>
      options.some((option) => option.action === 'commit' && option.kind === 'doors')
    const hasDrive = (options: ReturnType<typeof buildAddOptions>) =>
      options.some((option) => option.action === 'open' && option.category === 'drive')

    expect(hasDoors(forD)).toBe(true)
    expect(hasDrive(forD)).toBe(true)

    const forDr = buildAddOptions('dr', [])
    expect(hasDrive(forDr)).toBe(true)
    expect(hasDoors(forDr)).toBe(false)
  })

  it('never makes the generic Custom row index 0 unless it is the only row', () => {
    // A recognised kind, a matched category and a fuzzy typo all outrank Custom.
    for (const input of ['hotel', 'load in 10am', 'lod', 'd', 'soundcheck 3pm']) {
      const options = buildAddOptions(input, [])
      const first = options[0]
      const isGenericCustomFirst = first.action === 'commit' && first.kind === 'other'
      expect(isGenericCustomFirst && options.length > 1).toBe(false)
    }

    // With nothing to match, Custom is the only row and is allowed to be first.
    const unmatched = buildAddOptions('qwerty', [])
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0].action === 'commit' && unmatched[0].kind).toBe('other')
  })
})
