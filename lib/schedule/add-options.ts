import { DAY_ITEM_KINDS } from '@/lib/schedule/day-item-kinds'
import { parseDayItem, type ParsedDayItem } from '@/lib/schedule/parse-day-item'
import { detectFlightCode } from '@/lib/utils/flight-code'

// Brief 46, "one door into a day". The add panel is a single typed input that
// offers two kinds of thing: a day_items row it can commit directly (load-in,
// soundcheck, a custom block), and a flight/drive/rail/hotel, which has
// structure beyond a time and must open its own form instead.
//
// The ranking that decides what to show, in what order, used to live inside the
// combo box component, where no test could reach it (this repo has no way to
// render-test a component: no jsdom, no testing-library). This file is that
// ranking pulled out into one pure function, exactly as the parser itself was
// pulled out of the combo box in REE-21. tests/unit/add-options.test.ts pins it.

// The bookable categories, narrowed from the old six-way picker (which also
// carried 'show' and 'event') to the four that need a dedicated add form. A
// day-item event is now just text typed into this input; a show is reached from
// the venue block, not this picker. BOOK order: flight, drive, rail, hotel.
export type AddCategory = 'flight' | 'drive' | 'rail' | 'hotel'

interface AddCategoryDef {
  id: AddCategory
  label: string
  description: string
  // What a TM might type to reach it, matched against the parser's residual.
  // Lower case, the same normalisation the kind aliases use.
  aliases: string[]
}

// Order is load bearing: buildAddOptions('') returns the open rows in this
// order, and equal-scoring matches fall back to it.
export const ADD_CATEGORIES: readonly AddCategoryDef[] = [
  { id: 'flight', label: 'Flight', description: 'Airline segment', aliases: ['flight', 'fly', 'plane'] },
  { id: 'drive',  label: 'Drive',  description: 'Road transfer',   aliases: ['drive', 'car', 'van', 'bus'] },
  { id: 'rail',   label: 'Rail',   description: 'Train or coach',  aliases: ['rail', 'train'] },
  { id: 'hotel',  label: 'Hotel',  description: 'Accommodation',   aliases: ['hotel', 'bed'] },
]

/**
 * One row in the add panel. `action` is the field the preview row and the Enter
 * handler both read, and it is named for what the row does, not for what kind of
 * thing it is: 'commit' writes a day_items row there and then, 'open' leaves the
 * panel for the category's own form.
 *
 * The clocks on a commit row are wall time the parser read off the line. The
 * action resolves which calendar day they fall on with the rest of the day in
 * hand, so nothing here needs the timezone.
 */
export type AddOption =
  | {
      action: 'commit'
      // A kind name from DAY_ITEM_KINDS. 'other' is the custom catch-all.
      kind: string
      // What the row shows: a kind's label, a remembered custom title, or
      // 'Custom'.
      label: string
      // What the item is titled once committed. Null for a bare known kind.
      title: string | null
      startClock: string | null
      endClock: string | null
    }
  | {
      action: 'open'
      category: AddCategory
      label: string
      description: string
      // A bare flight code detected in the typed line ('CX150'), carried
      // through as the flight form's starting search query so Enter resolves
      // straight to the real flight instead of an empty form (REE-99).
      initialQuery?: string
    }

// The interpreted time for a commit row: a range when both ends are known, a
// single clock when only the start is, and the pending phrase when neither is,
// because a day item with no time is a real thing (day_items.starts_at is
// nullable) rather than an error.
function commitTime(option: Extract<AddOption, { action: 'commit' }>): string {
  if (!option.startClock) return 'no time yet'
  return option.endClock ? `${option.startClock}–${option.endClock}` : option.startClock
}

/**
 * The preview line for a highlighted row: what Enter will do if it is committed
 * from here. Exhaustive over AddOption so the merged panel can render it with no
 * fallback (REE-88): a commit row states what it stores and that Enter adds it,
 * an open row states which form Enter opens. The exact wording is the acceptance
 * criteria and is pinned in tests/unit/add-options.test.ts, which is why this
 * lives beside buildAddOptions where a test can reach it rather than inside the
 * uninstrumentable component.
 */
export function addOptionPreview(option: AddOption): string {
  if (option.action === 'commit') {
    return `${option.title ?? option.label} · ${commitTime(option)} · Enter adds it`
  }
  if (option.initialQuery) {
    return `${option.initialQuery.toUpperCase()} · Enter looks up the flight`
  }
  return `${option.label} · Enter opens the ${option.label.toLowerCase()} form`
}

// A prefix match, so a TM part way through typing 'dr' still surfaces Drive
// while it has stopped surfacing Doors. An exact match outranks a prefix so a
// fully typed word wins its own row, and a remembered title sits below both but
// above the generic Custom catch-all.
const EXACT_SCORE = 1
const PREFIX_SCORE = 0.8
const REMEMBERED_SCORE = 0.5

// The best score any alias in the set gives against the residual, or 0. The
// residual is expected already lower cased. A prefix match is the alias
// beginning with what the TM has typed so far, not the other way round.
function aliasScore(aliases: readonly string[], residual: string): number {
  if (!residual) return 0
  let best = 0
  for (const alias of aliases) {
    if (alias === residual) best = Math.max(best, EXACT_SCORE)
    else if (alias.startsWith(residual)) best = Math.max(best, PREFIX_SCORE)
  }
  return best
}

function openOption(def: AddCategoryDef): AddOption {
  return { action: 'open', category: def.id, label: def.label, description: def.description }
}

function commitFromKind(kind: string, label: string, parsed: ParsedDayItem | null, clock: ParsedDayItem | null): AddOption {
  return {
    action: 'commit',
    kind,
    label,
    // A parser candidate carries its own residual title ('Tesseract' soundcheck);
    // a kind reached only by prefix is a bare kind at whatever time was typed.
    title: parsed?.title ?? null,
    startClock: parsed?.startClock ?? clock?.startClock ?? null,
    endClock: parsed?.endClock ?? clock?.endClock ?? null,
  }
}

interface Scored {
  option: AddOption
  score: number
}

/**
 * The ranked add-panel rows for a typed line.
 *
 * Empty input offers the whole vocabulary: the four bookable categories in BOOK
 * order, then every day-item kind in DAY_ITEM_KINDS file order (its deliberate
 * chronological order), and no generic Custom row, because there is nothing to
 * title one with.
 *
 * A typed line is matched against the parser's residual, never the raw input:
 * 'hotel 3pm' has to reach the Hotel category exactly as 'hotel' does, and it
 * only does so once the time is stripped off first. buildAddOptions therefore
 * ranks against parseDayItem's leftover text, not the string the TM typed.
 *
 * Pure and side-effect free: same input, same output, no clock read and no model
 * call. customTitles is the tour's remembered custom titles, passed in rather
 * than fetched here so the function stays testable.
 */
export function buildAddOptions(input: string, customTitles: string[]): AddOption[] {
  const trimmed = (input ?? '').trim()

  const kinds = DAY_ITEM_KINDS.filter((kind) => kind.kind !== 'other')

  // Empty input: the whole vocabulary in its resting order, no custom row.
  if (!trimmed) {
    return [
      ...ADD_CATEGORIES.map(openOption),
      ...kinds.map((kind) => commitFromKind(kind.kind, kind.label, null, null)),
      ...customTitles.map<AddOption>((title) => ({
        action: 'commit', kind: 'other', label: title, title, startClock: null, endClock: null,
      })),
    ]
  }

  // A bare flight code ('CX150', 'cx 150', 'CX-150') is unambiguous, so it
  // short-circuits ahead of parseDayItem rather than going through the
  // residual like every other category below. parseDayItem's time regex reads
  // inline digits as an hour ('CX150' -> hour 15), which would mangle the code
  // before it got here; detecting on the raw trimmed text, per Brief 31,
  // sidesteps that entirely. The flight form gets the exact typed text back as
  // its starting query, resolving the same way its own search box already
  // does when a TM types a code there directly (REE-99).
  const flightCode = detectFlightCode(trimmed)
  if (flightCode) {
    const flightCategory = ADD_CATEGORIES.find((category) => category.id === 'flight')!
    return [{
      action: 'open',
      category: flightCategory.id,
      label: flightCategory.label,
      description: flightCategory.description,
      initialQuery: trimmed,
    }]
  }

  const { best, alternatives } = parseDayItem(trimmed)
  const parsed = [best, ...alternatives]
  // The parser always returns an 'other' candidate; it carries the residual text
  // (the line minus the time) and the time, which the category match, the custom
  // row and any timed kind all read from.
  const other = parsed.find((candidate) => candidate.kind === 'other') ?? null
  const residual = (other?.title ?? '').toLowerCase()
  const hasKindMatch = parsed.some((candidate) => candidate.kind !== 'other')

  // A line that is only a time, no kind word and no residual text, is what a
  // click on empty grid space produces (REE-56 pre-fills the snapped clock) and
  // what typing a bare '15:15' produces. Collapsing it to Custom would make every
  // click-to-add a custom block; instead offer the whole vocabulary at that time,
  // exactly like the empty state but timed, so the TM picks Load-in.
  if (!hasKindMatch && other?.startClock && !residual) {
    return [
      ...ADD_CATEGORIES.map(openOption),
      ...kinds.map((kind) => commitFromKind(kind.kind, kind.label, null, other)),
      ...customTitles.map<AddOption>((title) => ({
        action: 'commit', kind: 'other', label: title, title, startClock: other.startClock, endClock: other.endClock,
      })),
    ]
  }

  const scored: Scored[] = []

  // Categories, in BOOK order, kept only when the residual matches one.
  for (const def of ADD_CATEGORIES) {
    const score = aliasScore(def.aliases, residual)
    if (score > 0) scored.push({ option: openOption(def), score })
  }

  // Day-item kinds, in file order. A kind is kept when the parser matched it
  // (carrying its confidence, title and time) or when an alias prefix-matches
  // what has been typed so far (a bare kind at whatever time was on the line).
  for (const kind of kinds) {
    const parsedCandidate = parsed.find((candidate) => candidate.kind === kind.kind) ?? null
    const score = Math.max(parsedCandidate?.confidence ?? 0, aliasScore(kind.aliases, residual))
    if (score > 0) {
      scored.push({ option: commitFromKind(kind.kind, kind.label, parsedCandidate, other), score })
    }
  }

  // Remembered titles that contain the residual, so 'after' surfaces a stored
  // 'After show'. The exact match is left to the generic Custom row below.
  for (const title of customTitles) {
    const lower = title.toLowerCase()
    if (residual && lower !== residual && lower.includes(residual)) {
      scored.push({
        option: { action: 'commit', kind: 'other', label: title, title, startClock: other?.startClock ?? null, endClock: other?.endClock ?? null },
        score: REMEMBERED_SCORE,
      })
    }
  }

  // The generic Custom row, its title the residual text ('meet and greet 5.30pm'
  // commits as a custom item titled 'Meet and greet'). Scored at the parser's
  // 'other' confidence, below every real match, so it is never the highlighted
  // default unless it is the only row there is.
  if (other?.title) {
    scored.push({
      option: { action: 'commit', kind: 'other', label: `Custom: “${other.title}”`, title: other.title, startClock: other.startClock, endClock: other.endClock },
      score: other.confidence,
    })
  }

  // Stable sort by score: JS keeps the insertion order (BOOK, then file order,
  // then remembered, then Custom) among equal scores, so the resting order is
  // the tiebreak.
  return scored
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => (b.score - a.score) || (a.index - b.index))
    .map((entry) => entry.option)
}
