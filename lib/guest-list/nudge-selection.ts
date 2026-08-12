// The pure predicate behind trigger/jobs/guest-list-nudge.ts (Brief 52 step 10,
// REE-137). Kept separate from the job so the window boundary and the
// no-doors-row case are unit testable with no database and no Trigger.dev
// runtime: tests/unit/guest-list-nudge-selection.test.ts calls this directly.
//
// The window check is a plain instant comparison, deliberately. Doors is a
// stored UTC timestamptz and "two hours from now" is a real duration, not a
// calendar day, so there is no local-timezone reasoning to do here the way
// resolveTourDateId/localDateInZone answer "which day" - an instant range
// compares correctly for every tour regardless of timezone. The test fixtures
// use Pacific/Auckland to prove exactly that: the comparison must not
// accidentally depend on a UTC calendar day.
//
// now and windowHours are parameters rather than Date.now(), so this stays a
// pure function of its input. That is also what "does not fire when nothing
// has changed" means for this module: the same candidates always yield the
// same decisions. The thing that stops a second physical send on a repeat run
// is notification_log's dedup on notifyAccount's dedupDimension, not this
// function remembering anything.

export const DOORS_NUDGE_WINDOW_HOURS = 2

export type NudgeSkipReason = 'no_doors_row' | 'outside_window' | 'no_waiting_requests'

export interface DoorsNudgeCandidate {
  showId: string
  // Null covers both "no doors day_items row exists" and "a doors row exists
  // with no time set yet" - neither can be judged against the window, so both
  // skip with the same reason.
  doorsAt: string | null
  waitingCount: number
}

export interface DoorsNudgeDecision {
  showId: string
  selected: boolean
  reason?: NudgeSkipReason
}

export function selectShowsNeedingNudge(
  candidates: DoorsNudgeCandidate[],
  now: string,
  windowHours: number = DOORS_NUDGE_WINDOW_HOURS,
): DoorsNudgeDecision[] {
  const nowMs = new Date(now).getTime()
  const windowEndMs = nowMs + windowHours * 60 * 60 * 1000

  return candidates.map((candidate) => {
    if (!candidate.doorsAt) {
      return { showId: candidate.showId, selected: false, reason: 'no_doors_row' }
    }

    const doorsMs = new Date(candidate.doorsAt).getTime()
    if (doorsMs < nowMs || doorsMs > windowEndMs) {
      return { showId: candidate.showId, selected: false, reason: 'outside_window' }
    }

    if (candidate.waitingCount < 1) {
      return { showId: candidate.showId, selected: false, reason: 'no_waiting_requests' }
    }

    return { showId: candidate.showId, selected: true }
  })
}
