import { describe, it, expect } from 'vitest'
import { buildAddOptions, ADD_CATEGORIES } from '@/lib/schedule/add-options'
import { DAY_ITEM_KINDS } from '@/lib/schedule/day-item-kinds'

// REE-87, REE-282. The add-panel ranking, pulled out of the combo box so a test
// can reach it. buildAddOptions takes the type field's text and the panel's own
// Starts/Ends clocks as separate arguments: the clocks are never parsed out of
// the type text, they are stamped onto every returned row exactly as passed in.
// The interesting rule below is that category and kind matching reads the
// parser's residual, not the raw type text, so a stray word alongside a kind
// name does not knock it out of first place.
//
// Counts are derived from DAY_ITEM_KINDS rather than written down: REE-100
// already changed the number once (four on/off kinds collapsed to two windowed
// ones), and CLAUDE.md's rule is that no number about this repo lives in prose.

const KINDS_EXCEPT_OTHER = DAY_ITEM_KINDS.filter((kind) => kind.kind !== 'other')

describe('buildAddOptions', () => {
  it('offers the four categories then every kind, and no generic Custom, on empty input', () => {
    const options = buildAddOptions('', null, null, [])

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

  it('carries the Starts/Ends clocks onto every row on empty input, unmatched or not', () => {
    const options = buildAddOptions('', '10:00', '11:00', [])
    for (const option of options) {
      if (option.action !== 'commit') continue
      expect(option.startClock).toBe('10:00')
      expect(option.endClock).toBe('11:00')
    }
  })

  it('ranks a matched kind first and stamps the given clock onto it', () => {
    const options = buildAddOptions('load in', '10:00', null, [])
    const first = options[0]

    expect(first.action).toBe('commit')
    if (first.action !== 'commit') throw new Error('expected a commit row')
    expect(first.kind).toBe('load_in')
    expect(first.startClock).toBe('10:00')
  })

  it('ignores anything the parser would have read as a time in the type text, using the clock fields instead', () => {
    // 'load in 10am' used to have its embedded time parsed out; REE-282 retired
    // that path, so the digits are just more text the alias match ignores and
    // the clock comes from the explicit argument, not the string.
    const options = buildAddOptions('load in 10am', '14:00', null, [])
    const loadIn = options.find((option) => option.action === 'commit' && option.kind === 'load_in')
    expect(loadIn).toBeDefined()
    if (!loadIn || loadIn.action !== 'commit') throw new Error('expected a commit row')
    expect(loadIn.startClock).toBe('14:00')
  })

  it('ranks a matched category first', () => {
    const options = buildAddOptions('hotel', null, null, [])
    const first = options[0]

    expect(first.action).toBe('open')
    if (first.action !== 'open') throw new Error('expected an open row')
    expect(first.category).toBe('hotel')
  })

  it('matches categories against the residual, not the raw input, so a stray time-like word does not hide Hotel', () => {
    // The load-bearing assertion, carried over from before REE-282. A TM typing
    // into the type field can still write something that looks like a time
    // ('hotel 3pm'); matched against the raw string the 'hotel' alias no longer
    // lines up, and Hotel drops out of first place. Matched against the
    // parser's residual (the line with the time-shaped text removed) it is
    // index 0, exactly as bare 'hotel' is. The parsed time itself is discarded:
    // only the residual matters here, the clock comes from the fields.
    const options = buildAddOptions('hotel 3pm', null, null, [])
    const first = options[0]

    expect(first.action).toBe('open')
    if (first.action !== 'open') throw new Error('expected an open row')
    expect(first.category).toBe('hotel')
  })

  it('ranks a typo-matched kind above the custom row (Brief 42 typo rule)', () => {
    const options = buildAddOptions('lod', null, null, [])

    const loadInIndex = options.findIndex((option) => option.action === 'commit' && option.kind === 'load_in')
    const customIndex = options.findIndex(
      (option) => option.action === 'commit' && option.kind === 'other',
    )

    expect(loadInIndex).toBeGreaterThanOrEqual(0)
    expect(customIndex).toBeGreaterThanOrEqual(0)
    expect(loadInIndex).toBeLessThan(customIndex)
  })

  it('prefix-matches: "d" surfaces both Doors and Drive, "dr" surfaces Drive and not Doors', () => {
    const forD = buildAddOptions('d', null, null, [])
    const hasDoors = (options: ReturnType<typeof buildAddOptions>) =>
      options.some((option) => option.action === 'commit' && option.kind === 'doors')
    const hasDrive = (options: ReturnType<typeof buildAddOptions>) =>
      options.some((option) => option.action === 'open' && option.category === 'drive')

    expect(hasDoors(forD)).toBe(true)
    expect(hasDrive(forD)).toBe(true)

    const forDr = buildAddOptions('dr', null, null, [])
    expect(hasDrive(forDr)).toBe(true)
    expect(hasDoors(forDr)).toBe(false)
  })

  it('resolves a bare flight code straight to the flight open row, carrying it as the initial query (REE-99)', () => {
    for (const input of ['CX150', 'cx 150', 'CX-150']) {
      const options = buildAddOptions(input, null, null, [])
      expect(options).toHaveLength(1)
      const [only] = options
      expect(only.action).toBe('open')
      if (only.action !== 'open') throw new Error('expected an open row')
      expect(only.category).toBe('flight')
      expect(only.initialQuery).toBe(input)
    }
  })

  it('does not treat a flight code followed by anything else as a bare code', () => {
    // Anchored: 'CX150 tonight' is not just a flight code, so it falls through
    // to the normal residual-matching path rather than short-circuiting.
    const options = buildAddOptions('CX150 tonight', null, null, [])
    const flightOpen = options.find((option) => option.action === 'open' && option.category === 'flight')
    expect(flightOpen).toBeUndefined()
  })

  it('never makes the generic Custom row index 0 unless it is the only row', () => {
    // A recognised kind, a matched category and a fuzzy typo all outrank Custom.
    for (const input of ['hotel', 'load in', 'lod', 'd', 'soundcheck']) {
      const options = buildAddOptions(input, null, null, [])
      const first = options[0]
      const isGenericCustomFirst = first.action === 'commit' && first.kind === 'other'
      expect(isGenericCustomFirst && options.length > 1).toBe(false)
    }

    // With nothing to match, Custom is the only row and is allowed to be first.
    const unmatched = buildAddOptions('qwerty', null, null, [])
    expect(unmatched).toHaveLength(1)
    expect(unmatched[0].action === 'commit' && unmatched[0].kind).toBe('other')
  })
})

