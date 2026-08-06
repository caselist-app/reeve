import { dayItemKind, DAY_ITEM_KIND_NAMES } from '@/lib/schedule/day-item-kinds'
import { addDays, wallClockToUtc } from '@/lib/schedule/datetime'

// Which calendar day each day item's time actually falls on, for rows rather
// than columns.
//
// This is the roll-over for day items. It replaced an earlier column-based
// version that walked a fixed field list; that version and the table it read
// are gone (REE-23), and this is the only roll-over now.
//
// THE RULE IS UNCHANGED AND IS NOT BEING REOPENED. It is Brief 40's, and it is
// correct: times that cannot be after midnight sit on the show's own date
// whatever they say, and times that can run forward from the latest of those,
// where a clock reading earlier than the one before it has passed midnight.
// Anchoring on this day's own latest daytime time rather than on a constant hour
// is what makes festivals work, and a fixed cutoff is what makes a 05:00 lobby
// call land on the wrong morning. All eleven of the old function's assertions
// hold here; tests/unit/day-item-times.test.ts carries every one of them across.
//
// WHAT DID CHANGE, and why the brief calling this "only its input shape" is
// worth correcting. Three things, all forced by rows:
//
//   1. Results are keyed by item id, not by field name. A show can have two
//      soundchecks now, so a map keyed by kind would lose one of them. This is
//      the change that makes the old signature impossible rather than awkward.
//   2. A catering item carries both ends of its window on one row, where the old
//      input had a separate column per value. The daytime anchor is the LATEST
//      daytime time, so it has to consider an item's end as well as its start,
//      or a dinner running to 19:30 anchors at 18:00 and a 19:00 curfew wrongly
//      reads as having crossed midnight.
//   3. The order of the crossing kinds now comes from the array order in
//      lib/schedule/day-item-kinds.ts rather than from EVENING_FIELDS. That makes
//      the kind list's order load bearing, which nothing in the brief says.
//      tests/unit/day-item-kinds.test.ts pins it.
//
// Repeats of one kind are ordered among themselves by clock time, ascending, so
// two load-outs walk in the order they happen rather than in insertion order.

// Wall clock, not an instant. The caller converts a stored timestamptz with
// localTimeInZone() from lib/schedule/datetime.ts before calling, and turns the
// returned offset back into an instant with wallClockToUtc(). Keeping this
// function on plain HH:MM is what makes it a pure function with no timezone in
// it, which is the same contract resolveDayOffsets had.
export interface DayItemClock {
  id: string
  kind: string
  // 'HH:MM' in the tour's timezone, or null for an item with no time yet.
  clock: string | null
  // The end of a window, for the catering kinds. Null or absent for an instant.
  endClock?: string | null
}

// Used only when a day holds crossing times and nothing in the daytime to anchor
// against. An evening show is the overwhelming default, and the value only has
// to be late enough that a curfew in the small hours still reads as having
// crossed midnight. Same value and same reasoning as the old FALLBACK_ANCHOR.
const FALLBACK_ANCHOR = '18:00'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

// Position of a kind in the canonical list, built once from the one list.
const DAY_ITEM_KIND_ORDER = new Map(DAY_ITEM_KIND_NAMES.map((kind, index) => [kind, index]))

// Unknown kinds sort last rather than first, so a kind this build does not
// recognise cannot silently become the head of the evening run.
function kindOrder(kind: string): number {
  return DAY_ITEM_KIND_ORDER.get(kind) ?? Number.MAX_SAFE_INTEGER
}

/**
 * How many days after the day's own date each item's time falls on.
 *
 * Keyed by item id. An item with no time, or whose kind cannot cross midnight,
 * is absent from the result rather than present as 0, matching the old
 * function's behaviour: callers treat a missing entry as offset 0.
 *
 * `items` is every item on the day, not just the one being written. A partial
 * caller with only the item it is saving would have no daytime time to anchor
 * against and would fall back on every save, which is the bug the old
 * function's merged-view comment exists to prevent.
 */
export function resolveItemDayOffsets(items: DayItemClock[]): Record<string, number> {
  const offsets: Record<string, number> = {}

  // The latest daytime time on this day is the anchor. Both ends of a window
  // count: a dinner to 19:30 is later than its own 18:00 start, and using the
  // start alone would make a 19:00 curfew read as past midnight.
  let anchorMinutes = -1
  for (const item of items) {
    const kind = dayItemKind(item.kind)
    // An unknown kind is treated as non-crossing for the anchor, the safe
    // direction: it can raise the anchor but never joins the evening walk.
    if (kind?.crossesMidnight) continue
    for (const clock of [item.clock, item.endClock]) {
      if (!clock) continue
      anchorMinutes = Math.max(anchorMinutes, toMinutes(clock))
    }
  }
  if (anchorMinutes === -1) anchorMinutes = toMinutes(FALLBACK_ANCHOR)

  // Ordering two items of the SAME crossing kind cannot be done on the raw
  // clock, because midnight is the thing being detected: two load-outs at 23:30
  // and 00:30 would sort 00:30 first and then read 23:30 as the one that
  // crossed. Anything earlier than the anchor is already known to be past
  // midnight by the same rule the walk uses, so it sorts a day later.
  const effectiveMinutes = (clock: string): number => {
    const minutes = toMinutes(clock)
    return minutes < anchorMinutes ? minutes + 1440 : minutes
  }

  // The crossing items, in the order they occur: by canonical kind order, then
  // chronologically for repeats of one kind.
  const crossing = items
    .filter((item) => item.clock && dayItemKind(item.kind)?.crossesMidnight === true)
    .sort((a, b) => {
      const byKind = kindOrder(a.kind) - kindOrder(b.kind)
      if (byKind !== 0) return byKind
      return effectiveMinutes(a.clock as string) - effectiveMinutes(b.clock as string)
    })

  let previousMinutes = anchorMinutes
  let dayOffset = 0

  for (const item of crossing) {
    const minutes = toMinutes(item.clock as string)
    // The clock going backwards is the only evidence of midnight there is. It
    // accumulates rather than resetting, so a load-out at 03:00 stays on the
    // same morning as the 01:30 curfew before it instead of rolling again.
    if (minutes < previousMinutes) dayOffset += 1

    offsets[item.id] = dayOffset
    previousMinutes = minutes
  }

  return offsets
}

/**
 * The instants one item's wall-clock times actually store as.
 *
 * This is the write half of the rule above, and it is separate from the action
 * so it can be unit tested. The action's own job is fetching the day and
 * writing the row; deciding which calendar day 01:30 lands on is this.
 *
 * `items` is the WHOLE day merged with the change being saved, not just the item
 * being written. The roll-over is a property of the day: a curfew only reads as
 * past midnight relative to the latest daytime time on the same day, so an item
 * resolved on its own would anchor on the fallback every time.
 *
 * The offset is computed across the merged day but applied only to `itemId`, so
 * this stays a partial write. Adding a late doors time can change which day a
 * curfew belongs on, and this deliberately does not then rewrite the curfew: a
 * save that never mentioned it must not silently move it. Same trade
 * updateDaySheet made, and for the same reason.
 */
export interface ResolvedItemInstants {
  startsAt: string | null
  endsAt: string | null
  // A sentence for the TM, or null. Returned rather than thrown because the
  // caller is a server action whose contract is { error }, and because both
  // cases here are things a TM can type rather than things that have gone wrong.
  error: string | null
}

export function resolveItemInstants(
  items: DayItemClock[],
  itemId: string,
  // The tour_dates.date this day is, YYYY-MM-DD. The item has no date column of
  // its own, deliberately, so the day link is the only thing that says which day
  // offset zero means.
  dayDate: string,
  timezone: string,
): ResolvedItemInstants {
  const target = items.find((item) => item.id === itemId)
  if (!target) {
    return { startsAt: null, endsAt: null, error: 'That item is not on this day.' }
  }

  if (!target.clock) {
    // day_items_end_needs_start rejects this at the database, but a constraint
    // violation reaches a TM as a Postgres error string. An item with no time
    // yet is a real thing; an end with no start is a missing value.
    if (target.endClock) {
      return { startsAt: null, endsAt: null, error: 'An end time needs a start time.' }
    }
    return { startsAt: null, endsAt: null, error: null }
  }

  const offsets = resolveItemDayOffsets(items)
  const startOffset = offsets[itemId] ?? 0
  const startsAt = wallClockToUtc(`${addDays(dayDate, startOffset)}T${target.clock}`, timezone)

  if (!target.endClock) return { startsAt, endsAt: null, error: null }

  const startMinutes = toMinutes(target.clock)
  const endMinutes = toMinutes(target.endClock)

  // Equal is rejected rather than rolled forward. Rolling it would store a
  // twenty-four hour window from a TM who typed the same time twice, and a
  // window that long is indistinguishable on screen from a mistake, which is
  // what it is.
  if (endMinutes === startMinutes) {
    return { startsAt: null, endsAt: null, error: 'The end has to be after the start.' }
  }

  // A window whose end reads earlier than its start has crossed midnight, and
  // that is true of any kind: a load-out from 23:30 to 00:30 is half an hour,
  // not a rejection. This is a within-item rule and is separate from the day
  // walk above, which is about where a single instant sits. Both have to run, or
  // a catering window on a crossing day gets the day offset right and the end
  // wrong.
  const endOffset = startOffset + (endMinutes < startMinutes ? 1 : 0)
  const endsAt = wallClockToUtc(`${addDays(dayDate, endOffset)}T${target.endClock}`, timezone)

  return { startsAt, endsAt, error: null }
}
