import { describe, it, expect } from 'vitest'
import {
  assignOverlapDepths,
  INDENT_PX,
  MAX_INDENT_DEPTH,
} from '@/lib/schedule/overlap-layout'

// REE-76. The pure core of the staircase-indent layout, and the only place its
// correctness is asserted, because nothing wired to it yet. Instants are plain
// numbers here: this module derives no day, so a timezone would prove nothing.
//
// The assertion that matters is (b)'s paint order. Depth alone is not enough; a
// deeper block has to come later in the returned array so it renders on top of
// the shallower ones it overlaps. Everything else pins the ordering rules that
// keep a slot's anchor block at depth 0 and the adapter's input order intact.

// A block from `start` to `end`, in arbitrary time units, tagged so assertions
// can find it again after the layout reorders the array.
function block(id: string, start: number, end: number) {
  return { id, start, end }
}

describe('assignOverlapDepths', () => {
  // (a) No overlap: both flush at depth 0. The two blocks touch (one ends as the
  // next starts) and touching is not overlapping.
  it('leaves non-overlapping blocks at depth 0', () => {
    const result = assignOverlapDepths([block('a', 0, 60), block('b', 60, 120)])
    expect(result.map((r) => r.depth)).toEqual([0, 0])
    expect(result.map((r) => r.indentPx)).toEqual([0, 0])
  })

  // (b) Overlap: one steps behind the other, and the deeper one is LATER in the
  // array. This is the paint-order guarantee.
  it('steps an overlapping block behind and paints it later', () => {
    const result = assignOverlapDepths([block('a', 0, 60), block('b', 30, 90)])
    const depths = result.map((r) => r.depth).sort()
    expect(depths).toEqual([0, 1])

    const shallow = result.findIndex((r) => r.depth === 0)
    const deep = result.findIndex((r) => r.depth === 1)
    expect(deep).toBeGreaterThan(shallow)
    expect(result[shallow].indentPx).toBe(0)
    expect(result[deep].indentPx).toBe(INDENT_PX)
  })

  // (c) Same start, different duration: the longer block anchors the slot at
  // depth 0 and the shorter one steps behind it.
  it('anchors the longer of two same-start blocks at depth 0', () => {
    const result = assignOverlapDepths([block('short', 0, 30), block('long', 0, 90)])
    const long = result.find((r) => r.id === 'long')!
    const short = result.find((r) => r.id === 'short')!
    expect(long.depth).toBe(0)
    expect(short.depth).toBe(1)
  })

  // (d) Same start, same duration: input order is preserved, so whatever order
  // the adapter handed us survives.
  it('preserves input order for identical blocks', () => {
    const result = assignOverlapDepths([block('first', 0, 60), block('second', 0, 60)])
    expect(result.map((r) => r.id)).toEqual(['first', 'second'])
  })

  // (e) A chain a-b-c overlapping in sequence climbs 0, 1, 2, even though a and c
  // never overlap each other. Depth is a staircase, not a count of overlaps.
  it('climbs a chain of overlaps including non-adjacent pairs', () => {
    const result = assignOverlapDepths([
      block('a', 0, 40),
      block('b', 30, 70),
      block('c', 60, 100),
    ])
    const byId = Object.fromEntries(result.map((r) => [r.id, r.depth]))
    expect(byId).toEqual({ a: 0, b: 1, c: 2 })
  })

  // (f) Six mutually overlapping blocks reach depths 0 to 5, ascending, with the
  // indent capped once depth passes MAX_INDENT_DEPTH: depths 4 and 5 both stop at
  // 176px.
  it('caps the indent past the max depth while depth keeps climbing', () => {
    const items = Array.from({ length: 6 }, (_, i) => block(`b${i}`, i, 1000))
    const result = assignOverlapDepths(items)
    expect(result.map((r) => r.depth)).toEqual([0, 1, 2, 3, 4, 5])

    const cap = MAX_INDENT_DEPTH * INDENT_PX
    expect(cap).toBe(176)
    expect(result.map((r) => r.indentPx)).toEqual([0, 44, 88, 132, 176, 176])
  })

  // (g) Empty in, empty out.
  it('returns an empty array unchanged', () => {
    expect(assignOverlapDepths([])).toEqual([])
  })
})
