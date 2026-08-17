import { describe, it, expect } from 'vitest'
import { rankOptions } from '@/lib/logistics/rank'
import type { TravelOption } from '@/lib/logistics/types'

// CLAUDE.md, non-negotiable: "Do not rank logistics options by price in V1.
// Feasibility first." rankOptions is the one function that decides the order a
// TM sees options in, so it is the whole enforcement of that rule. There is no
// price field on TravelOption at all; the tiebreak chain below (door_to_site_at,
// then duration, then mode preference) is what stands in its place.

let nextId = 0

function option(over: Partial<TravelOption> = {}): TravelOption {
  nextId += 1
  return {
    mode: 'flight',
    depart_at: '2026-06-14T08:00:00.000Z',
    arrive_at: '2026-06-14T09:00:00.000Z',
    carrier: `carrier-${nextId}`,
    carrier_logo_url: null,
    leg_ref: `leg-${nextId}`,
    transit_min: 45,
    ground_min: 20,
    door_to_site_at: '2026-06-14T10:00:00.000Z',
    feasible: true,
    book_url: `https://example.com/book/${nextId}`,
    ground_transit: null,
    raw: null,
    ...over,
  }
}

describe('rankOptions', () => {
  it('sorts feasible options before infeasible ones without dropping either', () => {
    const feasible = option({ feasible: true, door_to_site_at: '2026-06-14T12:00:00.000Z' })
    const infeasible = option({ feasible: false, door_to_site_at: '2026-06-14T08:00:00.000Z' })

    const ranked = rankOptions([infeasible, feasible])

    expect(ranked).toHaveLength(2)
    expect(ranked[0]).toBe(feasible)
    expect(ranked[1]).toBe(infeasible)
  })

  it('sorts feasible options by earliest door_to_site_at first', () => {
    const later = option({ leg_ref: 'later', door_to_site_at: '2026-06-14T14:00:00.000Z' })
    const earlier = option({ leg_ref: 'earlier', door_to_site_at: '2026-06-14T10:00:00.000Z' })

    const ranked = rankOptions([later, earlier])

    expect(ranked.map((o) => o.leg_ref)).toEqual(['earlier', 'later'])
  })

  it('breaks a door_to_site_at tie by shorter journey duration', () => {
    const longer = option({
      leg_ref: 'longer',
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T08:00:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z', // 3h
    })
    const shorter = option({
      leg_ref: 'shorter',
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T10:00:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z', // 1h
    })

    const ranked = rankOptions([longer, shorter])

    expect(ranked.map((o) => o.leg_ref)).toEqual(['shorter', 'longer'])
  })

  it('breaks a duration tie by mode preference: rail before flight before ground', () => {
    const shared = {
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T08:00:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z',
    }
    const ground = option({ ...shared, leg_ref: 'ground', mode: 'ground' })
    const rail = option({ ...shared, leg_ref: 'rail', mode: 'rail' })
    const flight = option({ ...shared, leg_ref: 'flight', mode: 'flight' })

    const ranked = rankOptions([ground, flight, rail])

    expect(ranked.map((o) => o.mode)).toEqual(['rail', 'flight', 'ground'])
  })

  it('pins the full ordering across a mixed, deliberately shuffled fixture', () => {
    // Tiers, in the order the function must produce them:
    // 1. feasible, earliest door_to_site_at (10:00)
    // 2. feasible, door_to_site_at 12:00, shorter duration
    // 3. feasible, door_to_site_at 12:00, same duration as #4, rail beats flight
    // 4. feasible, door_to_site_at 12:00, same duration as #3, flight loses to rail
    // 5. infeasible, always last regardless of how early its own times look
    const earliestArrival = option({
      leg_ref: 'earliest-arrival',
      feasible: true,
      door_to_site_at: '2026-06-14T10:00:00.000Z',
    })
    const shortHop = option({
      leg_ref: 'short-hop',
      feasible: true,
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T10:30:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z', // 30 min
    })
    const tiedRail = option({
      leg_ref: 'tied-rail',
      mode: 'rail',
      feasible: true,
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T08:00:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z', // 3h
    })
    const tiedFlight = option({
      leg_ref: 'tied-flight',
      mode: 'flight',
      feasible: true,
      door_to_site_at: '2026-06-14T12:00:00.000Z',
      depart_at: '2026-06-14T08:00:00.000Z',
      arrive_at: '2026-06-14T11:00:00.000Z', // 3h, same duration as tiedRail
    })
    const infeasibleButEarly = option({
      leg_ref: 'infeasible-but-early',
      feasible: false,
      door_to_site_at: '2026-06-14T09:00:00.000Z',
      depart_at: '2026-06-14T08:00:00.000Z',
      arrive_at: '2026-06-14T08:30:00.000Z',
    })

    const shuffled = [
      tiedFlight,
      infeasibleButEarly,
      shortHop,
      tiedRail,
      earliestArrival,
    ]

    const ranked = rankOptions(shuffled)

    expect(ranked.map((o) => o.leg_ref)).toEqual([
      'earliest-arrival',
      'short-hop',
      'tied-rail',
      'tied-flight',
      'infeasible-but-early',
    ])
  })

  it('does not mutate the input array', () => {
    const a = option({ leg_ref: 'a', feasible: false })
    const b = option({ leg_ref: 'b', feasible: true })
    const input = [a, b]

    rankOptions(input)

    expect(input.map((o) => o.leg_ref)).toEqual(['a', 'b'])
  })
})
