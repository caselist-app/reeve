// Shared ranked-search used by every reference-table autocomplete in the Add
// Flight flow (airline search, and airport search for "Find by route"'s
// From/To fields). AirLabs' reference dumps are large and mostly irrelevant
// to any given query (thousands of small/historic operators or minor
// airfields), so a plain substring match lets junk results outrank the real
// carrier or airport just because they sort earlier alphabetically. Rank by
// match quality first, alphabetically within a tier, bare substring only as
// a last resort.
export interface Rankable {
  primaryCode: string | null    // e.g. IATA code - an exact match here always wins
  secondaryCode?: string | null // e.g. ICAO code
  name: string
  // e.g. an airport's city, so "London" finds LHR/LGW/LCY. Ranked just below
  // a name-startsWith match, since a city query is usually just as intentful.
  extra?: string | null
}

// Takes a selector rather than requiring T to conform to Rankable directly,
// so it can rank Airline and Airport objects (different field names) without
// either shape needing to be reshaped by every caller.
export function rankSearch<T>(items: T[], query: string, toRankable: (item: T) => Rankable, limit = 8): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  type Ranked = { item: T; rankable: Rankable; tier: number }
  const ranked: Ranked[] = []

  for (const item of items) {
    const rankable = toRankable(item)
    const name = rankable.name.toLowerCase()
    const primary = rankable.primaryCode?.toLowerCase() ?? ''
    const secondary = rankable.secondaryCode?.toLowerCase() ?? ''
    const extra = rankable.extra?.toLowerCase() ?? ''

    let tier: number | null = null
    if (primary === q) tier = 0
    else if (name.startsWith(q) || extra.startsWith(q)) tier = 1
    else if (primary.startsWith(q)) tier = 2
    else if (secondary.startsWith(q)) tier = 3
    else if (rankable.primaryCode && (name.includes(q) || extra.includes(q))) tier = 4
    else if (name.includes(q) || secondary.includes(q) || extra.includes(q)) tier = 5

    if (tier !== null) ranked.push({ item, rankable, tier })
  }

  ranked.sort((x, y) => x.tier - y.tier || x.rankable.name.localeCompare(y.rankable.name))
  return ranked.slice(0, limit).map((r) => r.item)
}
