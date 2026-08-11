import { describe, it, expect } from 'vitest'
import {
  summarise,
  waitingPhrase,
  allotmentLines,
} from '@/lib/schedule/guest-list-summary'

// The pure part of the day-info Guest list block. Brief 52, step 4 (REE-131). No
// component in this repo can be render-tested (no @testing-library, no jsdom), so
// the count, the singular/plural and the over-allotment wording are pinned here
// against the functions the block and the panel both call.

describe('summarise', () => {
  // The count is a headcount of the door: approved plus requested, one per row.
  // draft (an in-progress chat request), declined and removed are all off the
  // list and must not be counted, which is the whole point of the exclusion.
  it('counts approved and requested, and excludes draft, declined and removed', () => {
    const entries = [
      { status: 'approved', num_tickets: 1, pass_type: 'ticket' },
      { status: 'approved', num_tickets: 3, pass_type: 'ticket' },
      { status: 'requested', num_tickets: 1, pass_type: 'ticket' },
      { status: 'draft', num_tickets: 1, pass_type: 'ticket' },
      { status: 'declined', num_tickets: 1, pass_type: 'ticket' },
      { status: 'removed', num_tickets: 1, pass_type: 'ticket' },
    ]

    // Three on the list (two approved, one requested), one of them waiting. Not
    // five: the ticket counts do not inflate the headcount either.
    expect(summarise(entries)).toEqual({ total: 3, waiting: 1 })
  })

  it('is all zeros for an empty list', () => {
    expect(summarise([])).toEqual({ total: 0, waiting: 0 })
  })
})

describe('waitingPhrase', () => {
  // "1 waiting", not "1 waitings": the count is a gerund and does not inflect.
  it('reads "1 waiting" for a single waiting name', () => {
    expect(waitingPhrase(1)).toBe('1 waiting')
  })

  it('reads "3 waiting" for several', () => {
    expect(waitingPhrase(3)).toBe('3 waiting')
  })
})

describe('allotmentLines', () => {
  // Ten approved tickets against an allotment of eight: over by two, so the line
  // reads "10 of 8 tickets" and is flagged. requested tickets do not count: a
  // name the TM has not approved holds no committed ticket, the same basis the
  // over-allotment warning in decide.ts uses.
  it('flags an over-allotment and reads "10 of 8 tickets"', () => {
    const entries = [
      { status: 'approved', num_tickets: 6, pass_type: 'ticket' },
      { status: 'approved', num_tickets: 4, pass_type: 'ticket' },
      { status: 'requested', num_tickets: 5, pass_type: 'ticket' },
    ]

    expect(allotmentLines(entries, [{ pass_type: 'ticket', num_allowed: 8 }])).toEqual([
      { passType: 'ticket', label: '10 of 8 tickets', over: true },
    ])
  })

  it('is within the allotment when usage does not exceed it', () => {
    const entries = [{ status: 'approved', num_tickets: 5, pass_type: 'ticket' }]

    expect(allotmentLines(entries, [{ pass_type: 'ticket', num_allowed: 8 }])).toEqual([
      { passType: 'ticket', label: '5 of 8 tickets', over: false },
    ])
  })

  // A show with no allotment rows has no limits, so it produces no lines at all.
  // "No allotments" is silence, not "0 of 0 tickets", which would read as a limit
  // of zero rather than the absence of one.
  it('reports no limits, not zero, when a show has no allotments', () => {
    const entries = [{ status: 'approved', num_tickets: 10, pass_type: 'ticket' }]

    expect(allotmentLines(entries, [])).toEqual([])
  })
})
