// Which calendar day each day-sheet time actually falls on.
//
// A tour day is a working period, not a calendar day. A curfew of 01:30 belongs
// to the show it ends, and a TM looking at that show's day expects to see it
// there. Two facts got collapsed into one because of that: which day a time is
// displayed under, and what instant it actually is.
//
// Display is already right and needs nothing from this file. Day-sheet times
// reach the timeline as an embedded select on the show (SHOW_SELECT in
// lib/schedule/day-records.ts), so they render on whatever day the show sits on
// and nothing filters them by their own timestamp. That is the working-day rule,
// already true.
//
// The instant was wrong. updateDaySheet pinned every time to the show's own
// date, so a 01:30 curfew was stored twenty hours BEFORE the show it belongs to,
// and the timeline (which sorts on the stored timestamp) put it at the very top
// of the day, above venue access. This file decides the day offset so the stored
// instant is the real one. Fixing the instant fixes the sort on its own; no
// change to sorting or grouping was needed.
//
// The rule, and why it is this one:
//
// Fields split into those that cannot be after midnight and those that
// routinely are. Nothing in DAYTIME_FIELDS ever rolls, which is what makes a
// 05:00 lobby call and a 05:00 festival load-in correct without either being a
// special case. EVENING_FIELDS run forward from the latest daytime time on that
// show: a clock reading earlier than the one before it has passed midnight.
//
// Two rejected alternatives, recorded because both look better than they are.
// A single cutoff hour ("anything before 06:00 is tomorrow") pushes a 05:00
// lobby call onto the wrong day, and moving that cutoff to read time instead of
// write time just mirrors the failure. Running the rule over the whole field
// list in order needs DAY_SHEET_TIME_FIELDS to be chronological, and it is not:
// the six catering fields sit at the end, after load_out, so a 02:00 load-out
// would drag breakfast at 07:00 onto the morning after the show. Reordering the
// list to fix that means asserting that lunch precedes line check and dinner
// precedes soundcheck, which varies by tour, and a wrong guess moves a meal a
// day with nothing to notice it.
//
// Anchoring on the show's own daytime rather than on a constant is what makes
// festivals work: doors at 10:00 and a headliner off at 13:00 stay on the show
// day, because the comparison is against that day's actual shape.

// Never cross midnight. A time here is on the show's own date, whatever it says.
export const DAYTIME_FIELDS = [
  'hotel_departure',
  'catering_breakfast_start',
  'catering_breakfast_end',
  'venue_access',
  'load_in',
  'line_check',
  'catering_lunch_start',
  'catering_lunch_end',
  'soundcheck',
  'vip',
  'catering_dinner_start',
  'catering_dinner_end',
  'doors',
  'support_on',
] as const

// Can cross midnight, listed in the order they occur. Order matters here and
// only here, and this run is genuinely chronological: a support act finishes
// before the changeover, which finishes before the headliner goes on.
export const EVENING_FIELDS = [
  'support_off',
  'changeover',
  'headliner_on',
  'headliner_off',
  'curfew',
  'load_out',
] as const

// Used only when a day sheet holds evening times and no daytime time at all, so
// there is nothing on the show to anchor against. An evening show is the
// overwhelming default, and the value only has to be late enough that a curfew
// in the small hours still reads as having crossed midnight.
const FALLBACK_ANCHOR = '18:00'

type ClockTimes = Record<string, string | null | undefined>

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/**
 * How many days after the show's own date each populated time falls on.
 *
 * `times` is the merged view of the day sheet: the value this save submitted
 * where it submitted one, and the stored value where it did not. Merged rather
 * than just the payload, because a partial caller (confirmExtraction sends
 * load_in and curfew alone) would otherwise have no daytime time to anchor
 * against and would fall back on every save.
 *
 * Returns an offset per field, so callers stay responsible for turning a
 * date plus HH:MM into an instant in the tour's timezone. Every field this does
 * not mention is offset 0.
 */
export function resolveDayOffsets(times: ClockTimes): Record<string, number> {
  const offsets: Record<string, number> = {}

  // The latest daytime time on this show is the anchor. Latest rather than
  // "doors" or any other named field, because a day sheet is often half filled
  // in and the anchor has to be whatever the TM has actually told us about.
  let anchorMinutes = -1
  for (const field of DAYTIME_FIELDS) {
    const value = times[field]
    if (!value) continue
    anchorMinutes = Math.max(anchorMinutes, toMinutes(value))
  }
  if (anchorMinutes === -1) anchorMinutes = toMinutes(FALLBACK_ANCHOR)

  let previousMinutes = anchorMinutes
  let dayOffset = 0

  for (const field of EVENING_FIELDS) {
    const value = times[field]
    if (!value) continue

    const minutes = toMinutes(value)
    // The clock going backwards is the only evidence of midnight there is. It
    // accumulates rather than resetting, so a load-out at 03:00 stays on the
    // same morning as the 01:30 curfew before it instead of rolling again.
    if (minutes < previousMinutes) dayOffset += 1

    offsets[field] = dayOffset
    previousMinutes = minutes
  }

  return offsets
}

/**
 * `date` shifted forward by `offset` days, as YYYY-MM-DD.
 *
 * Deliberately UTC arithmetic on a plain calendar date, with no timezone
 * involved: this is "the day after 14 June", which is 15 June everywhere. The
 * tour timezone is applied afterwards, when the caller combines this date with
 * an HH:MM to produce an instant. Doing it in a zone here would be the
 * timestamptz-day trap in reverse.
 */
export function addDays(date: string, offset: number): string {
  if (offset === 0) return date
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + offset * 86_400_000)
    .toISOString()
    .slice(0, 10)
}

/**
 * Whole days from `from` to `to`, both YYYY-MM-DD. Negative if `to` is earlier.
 *
 * Same reasoning as addDays: plain calendar arithmetic in UTC, no timezone.
 * Used to read back the offset a stored time already carries when a show moves
 * date, so the roll-over survives the move instead of being recomputed.
 */
export function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.round(ms / 86_400_000)
}
