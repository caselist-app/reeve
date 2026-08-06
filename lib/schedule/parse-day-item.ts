import { DAY_ITEM_KINDS, dayItemKind, type DayItemKind } from '@/lib/schedule/day-item-kinds'

// REE-21. Turn one typed line into a day item, deterministically and with no
// model call. 'Tesseract sound is from 3-4pm' becomes a soundcheck titled
// Tesseract running 15:00 to 16:00.
//
// THE PARSER RETURNS WALL CLOCK, NOT INSTANTS, and takes neither a date nor a
// timezone. Which calendar day 01:30 falls on depends on the rest of the day: a
// curfew rolls to the following morning only relative to the day's latest
// daytime time. resolveItemDayOffsets and resolveItemInstants own that rule and
// they need the whole day. A pure parser sees one line, so any instant it built
// would be on the wrong date for every crossing kind. The header of
// lib/validators/day-item.ts is the same reasoning from the action's side.
//
// The fuzzy-match ranking lives here rather than in the combo box component, so
// it is a pure function that a unit test can pin. The kind list in
// lib/schedule/day-item-kinds.ts is the only vocabulary: aliases decide what a
// kind answers to, defaultMeridiem decides how a bare hour resolves.

export interface ParsedDayItem {
  // A kind name from DAY_ITEM_KINDS. Always set: an unrecognised line lands on
  // 'other' rather than failing to parse.
  kind: string
  // The residual text, for a custom item or a named instance of a known kind
  // ('Tesseract' soundcheck). Null when nothing is left after the alias and the
  // time are removed.
  title: string | null
  // 'HH:MM' in the tour's timezone, or null for a line with no time. Nullable
  // because day_items.starts_at is: an item with no time yet is a real thing.
  startClock: string | null
  endClock: string | null
  // 0 to 1. An exact alias match is 1, a fuzzy match scores by edit distance,
  // and the 'other' fallback is low. Used to rank best against alternatives and
  // to decide whether to preselect the guess in the combo box.
  confidence: number
  // Field names the form still needs before the item can save: 'startClock'
  // when no time was typed, 'title' when a custom item has no text. Lets the add
  // form highlight what is left rather than the parser inventing a value.
  missing: string[]
}

export interface ParseDayItemResult {
  // The top-ranked candidate. Never null: 'other' is always a valid answer.
  best: ParsedDayItem
  // Lower-ranked kinds the line could plausibly be, best first, plus an 'other'
  // escape hatch. The combo box offers these when the TM disagrees with best.
  alternatives: ParsedDayItem[]
}

// Words that carry no meaning in a title once the alias and time are gone.
// Trimmed from the ends of the residual text, not from the middle: a custom
// 'meet and greet' keeps its 'and', but 'Tesseract sound is from' loses the
// trailing 'is from' after 'sound' is removed. Deliberately small.
const EDGE_STOPWORDS = new Set([
  'is',
  'from',
  'at',
  'to',
  'the',
  'a',
  'an',
  'of',
  'for',
  'on',
  'starts',
  'start',
  'ends',
  'end',
])

// Below this edit-distance ratio a fuzzy alias match is discarded. Above it, the
// ratio is the confidence. Short aliases ('vip') are matched exactly only, so a
// typo never turns 'pip' into a VIP.
const FUZZY_MIN_RATIO = 0.75
const FUZZY_MIN_ALIAS_LENGTH = 4

// The 'other' fallback's confidence. Below any real alias match, including a
// fuzzy one, so a recognised kind always outranks 'custom'.
const OTHER_CONFIDENCE = 0.25

interface TimeAtom {
  hour: number
  minute: number
  meridiem: 'am' | 'pm' | null
}

interface TimeMatch {
  start: TimeAtom
  end: TimeAtom | null
  // The slice of the input the time occupied, so it can be cut before the text
  // is matched against aliases.
  index: number
  length: number
}

interface Token {
  // Edge-punctuation stripped, original case kept, for building a title.
  original: string
  // Lower case, alphanumeric only, for matching against aliases.
  norm: string
}

// A number 1 to 12 with optional minutes and an optional am/pm, as one regex
// atom reused for both ends of a range and for a lone time. The hour is allowed
// up to 23 so a 24 hour time ('14:00') parses; toClock rejects anything higher.
const TIME_ATOM = '(\\d{1,2})(?:[.:](\\d{2}))?\\s*(am|pm)?'

// A range: two atoms with a separator. Tried before the single form, so '3-4pm'
// is read as a range and not as the single time 3 with '4pm' left as text.
const RANGE_RE = new RegExp(`${TIME_ATOM}\\s*(?:-|–|to|until|till)\\s*${TIME_ATOM}`, 'i')
const SINGLE_RE = new RegExp(TIME_ATOM, 'i')

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toMinutes(clock: string): number {
  const [h, m] = clock.split(':')
  return Number(h) * 60 + Number(m)
}

// Resolve one atom to a 24 hour 'HH:MM', or null if it is not a real time.
//
// An explicit am/pm always wins. With none, an hour of 12 or more is already
// unambiguous and stays as typed (12:00 is noon, 14 is 14:00), and only 1 to 11
// falls back to the kind's default meridiem. This is the rule the kind list's
// defaultMeridiem comment describes: the guess is only ever consulted for a
// bare, ambiguous hour.
function toClock(atom: TimeAtom, defaultMeridiem: 'am' | 'pm'): string | null {
  if (atom.minute > 59) return null
  let hour = atom.hour

  if (atom.meridiem === 'pm') {
    if (hour < 12) hour += 12
  } else if (atom.meridiem === 'am') {
    if (hour === 12) hour = 0
  } else if (hour >= 1 && hour <= 11) {
    if (defaultMeridiem === 'pm') hour += 12
  }

  if (hour > 23 || hour < 0) return null
  return `${pad(hour)}:${pad(atom.minute)}`
}

function atomFrom(hour: string, minute: string | undefined, meridiem: string | undefined): TimeAtom {
  return {
    hour: Number(hour),
    minute: minute ? Number(minute) : 0,
    meridiem: meridiem ? (meridiem.toLowerCase() as 'am' | 'pm') : null,
  }
}

// Find the time expression in the input, preferring a range. Returns null when
// there is no digit to read: a line like 'load' is a real, time-less item.
function findTime(input: string): TimeMatch | null {
  const range = RANGE_RE.exec(input)
  if (range) {
    return {
      start: atomFrom(range[1], range[2], range[3]),
      end: atomFrom(range[4], range[5], range[6]),
      index: range.index,
      length: range[0].length,
    }
  }
  const single = SINGLE_RE.exec(input)
  if (single) {
    return {
      start: atomFrom(single[1], single[2], single[3]),
      end: null,
      index: single.index,
      length: single[0].length,
    }
  }
  return null
}

// Resolve a matched time to clock strings under one kind's default meridiem.
//
// A meridiem on one end of a range carries to the other ('3-4pm' is 15:00 to
// 16:00), which is what lets an explicit pm beat an am default. An end that is
// not after the start is rejected, not swapped: '4-3pm' keeps 16:00 and drops
// the end, because silently reordering it would invent a range the TM did not
// type. Crossing midnight is a property of the whole day and is settled later
// by resolveItemInstants, not guessed here from one line.
function resolveTimes(
  time: TimeMatch | null,
  defaultMeridiem: 'am' | 'pm',
): { startClock: string | null; endClock: string | null } {
  if (!time) return { startClock: null, endClock: null }

  const startMeridiem = time.start.meridiem ?? time.end?.meridiem ?? null
  const startClock = toClock({ ...time.start, meridiem: startMeridiem }, defaultMeridiem)

  if (!time.end) return { startClock, endClock: null }

  const endMeridiem = time.end.meridiem ?? time.start.meridiem ?? null
  let endClock = toClock({ ...time.end, meridiem: endMeridiem }, defaultMeridiem)

  if (startClock && endClock && toMinutes(endClock) <= toMinutes(startClock)) {
    endClock = null
  }

  return { startClock, endClock }
}

function tokenize(text: string): Token[] {
  return text
    .split(/\s+/)
    .map((raw) => {
      // Trim punctuation off the ends only, so an interior apostrophe or hyphen
      // survives in the title while a trailing comma does not.
      const original = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
      const norm = original.toLowerCase().replace(/[^a-z0-9]/g, '')
      return { original, norm }
    })
    .filter((token) => token.norm.length > 0)
}

// Standard Levenshtein edit distance, iterative with a single row.
function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[b.length]
}

interface KindMatch {
  kind: DayItemKind
  confidence: number
  // The token span the alias occupied, so it can be cut from the title. Absent
  // when the kind was reached by fallback rather than by name.
  span: [number, number] | null
  // Compared characters of the winning alias, the tiebreaker between two exact
  // matches so 'load out' beats the bare 'load'.
  aliasLength: number
}

// The best alias match for one kind against the token stream, or null. Exact
// (distance zero) scores 1; a close miss scores its edit-distance ratio, but
// only for aliases long enough that a typo is more likely than a real other
// word. Multi-word aliases are compared with their spaces removed, so 'lod in'
// still reaches 'load in'.
function matchKind(kind: DayItemKind, tokens: Token[]): KindMatch | null {
  let best: KindMatch | null = null

  for (const alias of kind.aliases) {
    const aliasWords = alias.split(' ')
    const aliasJoined = aliasWords.join('')
    const windowLength = aliasWords.length

    for (let i = 0; i + windowLength <= tokens.length; i++) {
      const windowJoined = tokens
        .slice(i, i + windowLength)
        .map((token) => token.norm)
        .join('')

      const distance = editDistance(windowJoined, aliasJoined)
      let confidence = 0
      if (distance === 0) {
        confidence = 1
      } else if (aliasJoined.length >= FUZZY_MIN_ALIAS_LENGTH) {
        const ratio = 1 - distance / aliasJoined.length
        if (ratio >= FUZZY_MIN_RATIO) confidence = ratio
      }

      if (confidence === 0) continue

      const candidate: KindMatch = {
        kind,
        confidence,
        span: [i, i + windowLength],
        aliasLength: aliasJoined.length,
      }
      if (
        !best ||
        candidate.confidence > best.confidence ||
        (candidate.confidence === best.confidence && candidate.aliasLength > best.aliasLength)
      ) {
        best = candidate
      }
    }
  }

  return best
}

// The title is what is left of the tokens once the alias span is removed and the
// filler words are trimmed off the ends. Capitalised on the first letter only,
// so 'meet and greet' reads as 'Meet and greet' and 'Tesseract' is untouched.
function buildTitle(tokens: Token[], span: [number, number] | null): string | null {
  const kept = span ? [...tokens.slice(0, span[0]), ...tokens.slice(span[1])] : [...tokens]

  let startIndex = 0
  let endIndex = kept.length
  while (startIndex < endIndex && EDGE_STOPWORDS.has(kept[startIndex].norm)) startIndex++
  while (endIndex > startIndex && EDGE_STOPWORDS.has(kept[endIndex - 1].norm)) endIndex--

  const words = kept.slice(startIndex, endIndex).map((token) => token.original)
  if (words.length === 0) return null

  const joined = words.join(' ')
  return joined.charAt(0).toUpperCase() + joined.slice(1)
}

function buildCandidate(
  kind: DayItemKind,
  span: [number, number] | null,
  confidence: number,
  tokens: Token[],
  time: TimeMatch | null,
): ParsedDayItem {
  const { startClock, endClock } = resolveTimes(time, kind.defaultMeridiem)
  const title = buildTitle(tokens, span)

  const missing: string[] = []
  if (!startClock) missing.push('startClock')
  // A custom item needs a title to satisfy the day_items other_needs_title
  // constraint; a known kind is fine without one.
  if (kind.kind === 'other' && !title) missing.push('title')

  return { kind: kind.kind, title, startClock, endClock, confidence, missing }
}

const OTHER_KIND = dayItemKind('other') as DayItemKind

/**
 * Parse a typed line into a ranked day item guess.
 *
 * Deterministic and side-effect free: same input, same output, no model call
 * and no clock read. The returned clocks are wall time in the tour's timezone;
 * the caller resolves which calendar day each falls on with the rest of the day
 * in hand (resolveItemInstants), because a single line cannot know.
 */
export function parseDayItem(input: string): ParseDayItemResult {
  const text = input ?? ''
  const time = findTime(text)

  // Cut the time out before matching aliases, so its digits never look like part
  // of a kind name and 'load 2' reads as the load-in, not a fuzzy miss.
  const withoutTime = time ? `${text.slice(0, time.index)} ${text.slice(time.index + time.length)}` : text
  const tokens = tokenize(withoutTime)

  const matches: KindMatch[] = []
  for (const kind of DAY_ITEM_KINDS) {
    if (kind.kind === 'other') continue
    const match = matchKind(kind, tokens)
    if (match) matches.push(match)
  }

  // Rank: confidence, then the longer alias (more specific), then list order so
  // the result is stable rather than dependent on iteration accidents.
  matches.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    if (b.aliasLength !== a.aliasLength) return b.aliasLength - a.aliasLength
    return DAY_ITEM_KINDS.indexOf(a.kind) - DAY_ITEM_KINDS.indexOf(b.kind)
  })

  const candidates = matches.map((match) =>
    buildCandidate(match.kind, match.span, match.confidence, tokens, time),
  )

  // 'other' is always available. It is the answer when nothing matched, and the
  // escape hatch alternative when something did. Its title is the whole residual
  // text, since no alias was removed.
  const otherCandidate = buildCandidate(OTHER_KIND, null, OTHER_CONFIDENCE, tokens, time)

  if (candidates.length === 0) {
    return { best: otherCandidate, alternatives: [] }
  }

  return { best: candidates[0], alternatives: [...candidates.slice(1), otherCandidate] }
}
