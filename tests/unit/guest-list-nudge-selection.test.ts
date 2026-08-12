import { describe, it, expect } from 'vitest'
import { selectShowsNeedingNudge, type DoorsNudgeCandidate } from '@/lib/guest-list/nudge-selection'
import { wallClockToUtc } from '@/lib/schedule/datetime'

// Brief 52, step 10 (REE-137). Pacific/Auckland is picked deliberately: the
// selection window is a plain instant comparison (see nudge-selection.ts), so
// these fixtures prove that holds for a tour nowhere near UTC, not just one on
// it.

const TZ = 'Pacific/Auckland'
const NOW = wallClockToUtc('2026-06-14T18:00', TZ)

function minutesFromNow(minutes: number): string {
  return new Date(new Date(NOW).getTime() + minutes * 60_000).toISOString()
}

describe('selectShowsNeedingNudge', () => {
  it('selects a show with doors in 90 minutes and requests waiting', () => {
    const candidates: DoorsNudgeCandidate[] = [
      { showId: 'show-1', doorsAt: minutesFromNow(90), waitingCount: 2 },
    ]

    expect(selectShowsNeedingNudge(candidates, NOW)).toEqual([
      { showId: 'show-1', selected: true },
    ])
  })

  it('does not select the same show when nothing is waiting', () => {
    const candidates: DoorsNudgeCandidate[] = [
      { showId: 'show-1', doorsAt: minutesFromNow(90), waitingCount: 0 },
    ]

    expect(selectShowsNeedingNudge(candidates, NOW)).toEqual([
      { showId: 'show-1', selected: false, reason: 'no_waiting_requests' },
    ])
  })

  it('does not select a show with doors six hours out', () => {
    const candidates: DoorsNudgeCandidate[] = [
      { showId: 'show-1', doorsAt: minutesFromNow(6 * 60), waitingCount: 2 },
    ]

    expect(selectShowsNeedingNudge(candidates, NOW)).toEqual([
      { showId: 'show-1', selected: false, reason: 'outside_window' },
    ])
  })

  it('does not select a show with no doors row, with reason no_doors_row', () => {
    const candidates: DoorsNudgeCandidate[] = [
      { showId: 'show-1', doorsAt: null, waitingCount: 2 },
    ]

    expect(selectShowsNeedingNudge(candidates, NOW)).toEqual([
      { showId: 'show-1', selected: false, reason: 'no_doors_row' },
    ])
  })

  // A job that alerts on every run trains the TM to ignore it. This predicate
  // has no memory of its own - notification_log's dedup on `${showId}:doors`
  // is what stops a second physical send - so what is provable here is that
  // the predicate is a pure function of its input: the same state always
  // yields the same decision, never one that flips on a second look with
  // nothing changed.
  it('yields the same decision on a second call with nothing changed', () => {
    const candidates: DoorsNudgeCandidate[] = [
      { showId: 'show-1', doorsAt: minutesFromNow(90), waitingCount: 2 },
    ]

    const first = selectShowsNeedingNudge(candidates, NOW)
    const second = selectShowsNeedingNudge(candidates, NOW)
    expect(second).toEqual(first)
  })
})
