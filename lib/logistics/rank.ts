import type { TravelOption } from '@/lib/logistics/types'

// Mode preference tiebreaker: rail beats flight beats ground.
// TMs generally prefer rail for short legs (no check-in, city-centre to city-centre).
const MODE_RANK: Record<TravelOption['mode'], number> = {
  rail: 0,
  flight: 1,
  ground: 2,
}

// Sort order:
// 1. Feasible options before infeasible.
// 2. Within feasible: door_to_site_at ascending (earliest arrival first).
// 3. Same door_to_site_at: duration ascending (arrive_at - depart_at).
// 4. Same duration: mode preference (rail > flight > ground).
//
// Infeasible options are always included at the bottom — never dropped.
// The TM may knowingly accept a tight option.
// There is no price field and there must not be one in V1.
export function rankOptions(options: TravelOption[]): TravelOption[] {
  return [...options].sort((a, b) => {
    // 1. Feasibility
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1

    // 2. Door-to-site arrival time
    const siteA = new Date(a.door_to_site_at).getTime()
    const siteB = new Date(b.door_to_site_at).getTime()
    if (siteA !== siteB) return siteA - siteB

    // 3. Journey duration
    const durA = new Date(a.arrive_at).getTime() - new Date(a.depart_at).getTime()
    const durB = new Date(b.arrive_at).getTime() - new Date(b.depart_at).getTime()
    if (durA !== durB) return durA - durB

    // 4. Mode preference
    return MODE_RANK[a.mode] - MODE_RANK[b.mode]
  })
}
