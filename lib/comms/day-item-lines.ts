import { dayItemKind, dayItemLabel } from '@/lib/schedule/day-item-kinds'

// How a day item reads in a message to crew. Brief 42, REE-20.
//
// Pure, and separate from the templates, because both /itinerary and the morning
// message need the same answer and because it is the one part of the comms
// repoint that can be unit tested without a database.
//
// THE RULE IS DECISION 3, AND IT IS NARROWER THAN IT LOOKS. Comms surface the
// start time only. "Load-in 10:00", never "Load-in 10:00 to 10:15". A TM does
// not talk in ranges, and a load-in with a fifteen minute end reads as a
// fifteen minute window when it is really a start with an estimate on it.
//
// The carve-out is catering, where the end is the entire point: a dinner window
// that does not say when it shuts is worse than useless. That is what
// surfaceEndInComms on the kind list means, and it is true for the three
// catering kinds and nothing else.
//
// WHAT CHANGED FROM COLUMNS, stated because it is visible to crew. The old
// templates rendered a fixed list of nine labels and printed "TBC" against every
// one the TM had not set, so a show with a load-in and nothing else sent eight
// lines of TBC. A day is rows now: there is no fixed list to render, and an item
// that does not exist has no line. A show with one time gets one line. Two
// soundchecks get two lines, which columns could not express at all.

export interface DayItemLine {
  kind: string
  title: string | null
  starts_at: string | null
  ends_at: string | null
}

type FormatTime = (iso: string | null, timezone: string) => string

/**
 * One line for one item, or null if it has no time to report.
 *
 * An item with no start is skipped rather than printed as TBC. "Soundcheck: TBC"
 * tells a crew member nothing they did not already know and pushes the lines
 * that matter off the top of a phone screen.
 *
 * `formatTime` is passed in rather than imported so this stays pure and so each
 * template keeps its own formatting. They genuinely differ: /itinerary prints a
 * date on the first entry of a day and the morning message never does.
 */
export function dayItemLine(
  item: DayItemLine,
  timezone: string,
  formatTime: FormatTime,
): string | null {
  if (!item.starts_at) return null

  // The kind's label, qualified by a title when there is one, so a soundcheck
  // for the support act reads "Soundcheck (Tesseract)" rather than as a second
  // unexplained soundcheck. A custom item has only its title, because 'Custom'
  // is what Reeve calls it and not what it is.
  const label = dayItemLabel(item.kind)
  const name =
    item.kind === 'other'
      ? (item.title ?? label)
      : item.title
        ? `${label} (${item.title})`
        : label

  const start = formatTime(item.starts_at, timezone)

  // Read off the kind list rather than tested against a catering prefix, so
  // promoting a kind or adding one decides this in the one place that decides
  // everything else about a kind.
  const showsEnd = dayItemKind(item.kind)?.surfaceEndInComms === true
  if (showsEnd && item.ends_at) {
    return `${name}: ${start} to ${formatTime(item.ends_at, timezone)}`
  }

  return `${name}: ${start}`
}

/**
 * Every item that has something to say, in the order they were handed over.
 *
 * Callers pass items already in running order, because the ordering is a
 * property of the query (starts_at then created_at) and re-sorting here would
 * be a second opinion about it.
 */
export function dayItemLines(
  items: DayItemLine[],
  timezone: string,
  formatTime: FormatTime,
): string[] {
  return items
    .map((item) => dayItemLine(item, timezone, formatTime))
    .filter((line): line is string => line !== null)
}
