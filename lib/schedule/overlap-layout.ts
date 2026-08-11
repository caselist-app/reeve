// REE-76. Where overlapping blocks sit on the day grid, as a pure function with
// nothing wired to it yet. RBC's `dayLayoutAlgorithm="no-overlap"` sets blocks
// side by side, which loses width fast once three or four things share a slot; a
// staircase indent keeps every block full width and readable instead. This
// module works out the indent, and only that.
//
// It imports nothing on purpose: no RBC, no luxon, no Supabase. It is arithmetic
// on start and end instants and says nothing about which day a block belongs to.
// That question has one authority (resolveTourDateId, localDateInZone) and this
// is not it. Keeping the file dependency-free is also what lets the unit suite
// exercise it with nothing installed beyond pnpm.

// One indent step, in pixels, per depth of overlap.
export const INDENT_PX = 44

// The staircase stops stepping after this depth: a seventh overlapping block
// would walk off the grid, so depth is clamped here for the indent (the depth
// number itself keeps climbing, only the pixels stop).
export const MAX_INDENT_DEPTH = 4

// The minimum an item must carry to be laid out: two instants. Date or epoch ms,
// coerced with unary +, so a caller can hand RBC's JS Dates straight in without
// this module knowing anything else about the shape.
export interface OverlapItem {
  start: Date | number
  end: Date | number
}

// What the layout adds to each item.
export interface OverlapDepth {
  // How many overlapping blocks this one steps behind. 0 is the leftmost, flush.
  depth: number
  // depth clamped to MAX_INDENT_DEPTH, times INDENT_PX. The value to offset by.
  indentPx: number
}

// Two half-open intervals overlap when each starts before the other ends. Strict
// on both sides, so blocks that merely touch (one ends exactly as the next
// starts) do not count: a 10:00 to 11:00 and an 11:00 to 12:00 sit flush.
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

// Assign each item its overlap depth and indent. The returned array is in paint
// order: an item is always preceded by everything it steps behind, so rendering
// the array in order draws the indented blocks on top of the ones they overlap.
//
// Depth is a staircase, not a count. An item's depth is one more than the
// deepest block it overlaps, so a chain a-b-c where a and c never touch still
// climbs 0, 1, 2: c steps behind b, and b already stepped behind a. Ordering
// before assignment is earliest start first, then longer duration first (so the
// long block anchors the slot at depth 0), then original input order, which is
// what makes a same-start same-duration pair keep the order the adapter handed us.
export function assignOverlapDepths<T extends OverlapItem>(
  items: readonly T[],
): (T & OverlapDepth)[] {
  const indexed = items.map((item, index) => ({
    item,
    index,
    start: +item.start,
    end: +item.end,
  }))

  const ordered = [...indexed].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    const durationA = a.end - a.start
    const durationB = b.end - b.start
    if (durationA !== durationB) return durationB - durationA
    return a.index - b.index
  })

  const placed: { start: number; end: number; depth: number }[] = []
  const result: (T & OverlapDepth)[] = []

  for (const entry of ordered) {
    let depth = 0
    for (const p of placed) {
      if (overlaps(entry.start, entry.end, p.start, p.end)) {
        depth = Math.max(depth, p.depth + 1)
      }
    }
    const indentPx = Math.min(depth, MAX_INDENT_DEPTH) * INDENT_PX
    placed.push({ start: entry.start, end: entry.end, depth })
    result.push({ ...entry.item, depth, indentPx })
  }

  return result
}
