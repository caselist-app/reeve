import { describe, it, expect } from 'vitest'
import { rankSearch, type Rankable } from '@/lib/utils/rank-search'

// Fixtures shaped like the two real callers (airport and airline search):
// primaryCode (IATA), secondaryCode (ICAO), name, extra (an airport's city).
interface Fixture extends Rankable {
  id: string
}

function item(over: Partial<Fixture> & { id: string; name: string }): Fixture {
  return {
    primaryCode: null,
    secondaryCode: null,
    extra: null,
    ...over,
  }
}

const toRankable = (f: Fixture): Rankable => f

describe('rankSearch', () => {
  it('ranks an exact primaryCode match (tier 0) above a name that merely starts with the query', () => {
    const nameStartsWith = item({ id: 'name-startswith', primaryCode: null, name: 'LHR International' })
    const exactCode = item({ id: 'exact-code', primaryCode: 'LHR', name: 'Heathrow' })

    const result = rankSearch([nameStartsWith, exactCode], 'lhr', toRankable)

    expect(result.map((r) => r.id)).toEqual(['exact-code', 'name-startswith'])
  })

  it('pins the full tier ordering across a mixed, deliberately shuffled fixture', () => {
    const q = 'abc'

    const tier0 = item({ id: 'tier0-exact-code', primaryCode: 'ABC', name: 'Zzz Airport' })
    const tier1 = item({ id: 'tier1-name-startswith', primaryCode: 'XYZ', name: 'Abcport' })
    const tier2 = item({ id: 'tier2-code-startswith', primaryCode: 'ABCD', name: 'Delta Field' })
    const tier3 = item({
      id: 'tier3-secondary-startswith',
      primaryCode: 'ZZZ',
      secondaryCode: 'ABCX',
      name: 'Mountain Field',
    })
    const tier4 = item({
      id: 'tier4-code-present-name-contains',
      primaryCode: 'ZZZ',
      secondaryCode: 'QQQ',
      name: 'Xabcy',
    })
    const tier5 = item({
      id: 'tier5-no-code-name-contains',
      primaryCode: null,
      name: 'Yabcz',
    })

    const shuffled = [tier3, tier5, tier0, tier4, tier1, tier2]

    const result = rankSearch(shuffled, q, toRankable)

    expect(result.map((r) => r.id)).toEqual([
      'tier0-exact-code',
      'tier1-name-startswith',
      'tier2-code-startswith',
      'tier3-secondary-startswith',
      'tier4-code-present-name-contains',
      'tier5-no-code-name-contains',
    ])
  })

  it('breaks a tie within a tier alphabetically by name, not input order', () => {
    const zulu = item({ id: 'zulu', primaryCode: null, name: 'Air Zulu' })
    const alpha = item({ id: 'alpha', primaryCode: null, name: 'Air Alpha' })

    // Fed in reverse-alphabetical order on purpose.
    const result = rankSearch([zulu, alpha], 'air', toRankable)

    expect(result.map((r) => r.id)).toEqual(['alpha', 'zulu'])
  })

  it('defaults to a limit of 8', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item({ id: `item-${i}`, name: `Item ${i}`, extra: 'zzz' })
    )

    const result = rankSearch(items, 'zzz', toRankable)

    expect(result).toHaveLength(8)
    expect(result.map((r) => r.id)).toEqual([
      'item-0', 'item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6', 'item-7',
    ])
  })

  it('truncates to an explicit smaller limit even when more items match', () => {
    const items = Array.from({ length: 10 }, (_, i) =>
      item({ id: `item-${i}`, name: `Item ${i}`, extra: 'zzz' })
    )

    const result = rankSearch(items, 'zzz', toRankable, 3)

    expect(result).toHaveLength(3)
  })

  it('returns an empty array for an empty or whitespace-only query, even when items exist', () => {
    const items = [item({ id: 'a', primaryCode: 'AAA', name: 'Alpha' })]

    expect(rankSearch(items, '', toRankable)).toEqual([])
    expect(rankSearch(items, '   ', toRankable)).toEqual([])
  })

  it('returns an empty array when nothing matches, rather than defaulting non-matching items to a low tier', () => {
    const items = [
      item({ id: 'a', primaryCode: 'AAA', name: 'Alpha', secondaryCode: 'EGAA', extra: 'Somewhere' }),
      item({ id: 'b', primaryCode: 'BBB', name: 'Beta', secondaryCode: 'EGBB', extra: 'Elsewhere' }),
    ]

    expect(rankSearch(items, 'nomatch', toRankable)).toEqual([])
  })

  it('includes a primaryCode: null item that only matches via substring-in-name, at tier 5 rather than excluding it', () => {
    // Same name-contains-query relationship on both items: neither name
    // starts with the query. Tier 4 requires a truthy primaryCode; tier 5
    // has no such guard, so the null-primaryCode item is not shut out, it
    // just lands one tier lower.
    const withCode = item({ id: 'with-code', primaryCode: 'XXX', name: 'FooBarQuery' })
    const withoutCode = item({ id: 'without-code', primaryCode: null, name: 'FooBarQuery' })

    const result = rankSearch([withoutCode, withCode], 'query', toRankable)

    expect(result.map((r) => r.id)).toEqual(['with-code', 'without-code'])
  })
})
