import { schedules } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAccount } from '@/lib/comms/notify/account'
import { registry } from '@/lib/comms/notify/registry'
import {
  selectShowsNeedingNudge,
  DOORS_NUDGE_WINDOW_HOURS,
  type DoorsNudgeCandidate,
} from '@/lib/guest-list/nudge-selection'

// Formats a YYYY-MM-DD show date as "Mon 14 Jul", same trick as
// morning-message.ts's formatShowDate: noon UTC sidesteps any date rollover
// from the server's own timezone, and this is copy, not a day calculation, so
// no tour timezone is needed here.
function formatShowDate(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00.000Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type DoorsItem = { show_id: string | null; starts_at: string | null }
type ShowRow = {
  id: string
  tour_id: string
  venue_name: string
  date: string
  tours: { account_id: string } | null
}

// Brief 52, step 10 (REE-137). Runs hourly. Tells the TM once, a couple of
// hours before doors, when guest requests are still waiting - never on every
// run, only for the shows selectShowsNeedingNudge picks. Doors is a
// day_items row (kind 'doors'), not a column on shows, so a show with no
// doors row set yet is skipped rather than treated as "no doors ever".
//
// Writes nothing before the send: the claim is the notification_log row
// notifyAccount inserts, keyed by dedupDimension `${showId}:doors`. A show
// that is still in the window on the next hourly run is a no-op there, which
// is what keeps this to one message per show per day.
export const guestListNudgeJob = schedules.task({
  id: 'guest-list-nudge',
  cron: '0 * * * *',
  run: async () => {
    const admin = createAdminClient()
    const now = new Date()
    const windowEnd = new Date(now.getTime() + DOORS_NUDGE_WINDOW_HOURS * 60 * 60 * 1000)

    // A wide net rather than the exact boundary: this is an optimisation, not
    // the correctness check. selectShowsNeedingNudge re-checks the window
    // itself against `now`, so the two can never disagree about what "in
    // window" means, and the same predicate is what tests/unit/guest-list-nudge-selection.test.ts
    // exercises directly with no database involved.
    const { data: doorsItems, error: doorsError } = await admin
      .from('day_items')
      .select('show_id, starts_at')
      .eq('kind', 'doors')
      .not('show_id', 'is', null)
      .gte('starts_at', now.toISOString())
      .lte('starts_at', windowEnd.toISOString())

    // A failed read must never render as an empty result (CLAUDE.md): logged
    // and skipped with a reason, not silently treated as "nothing due".
    if (doorsError) {
      console.error('[guest-list-nudge] doors lookup failed:', doorsError.message)
      return { skipped: true, reason: 'doors_read_failed' }
    }

    const showIds = [...new Set((doorsItems ?? []).map((d) => d.show_id).filter((id): id is string => !!id))]

    if (showIds.length === 0) {
      return { skipped: true, reason: 'no_shows_in_window' }
    }

    const { data: waitingEntries, error: entriesError } = await admin
      .from('guest_list_entries')
      .select('show_id')
      .in('show_id', showIds)
      .eq('status', 'requested')

    if (entriesError) {
      console.error('[guest-list-nudge] guest list entries lookup failed:', entriesError.message)
      return { skipped: true, reason: 'entries_read_failed' }
    }

    const waitingCountByShow = new Map<string, number>()
    for (const entry of waitingEntries ?? []) {
      if (!entry.show_id) continue
      waitingCountByShow.set(entry.show_id, (waitingCountByShow.get(entry.show_id) ?? 0) + 1)
    }

    const candidates: DoorsNudgeCandidate[] = (doorsItems as DoorsItem[]).map((item) => ({
      showId: item.show_id!,
      doorsAt: item.starts_at,
      waitingCount: waitingCountByShow.get(item.show_id!) ?? 0,
    }))

    const decisions = selectShowsNeedingNudge(candidates, now.toISOString())
    const toNudge = decisions.filter((d) => d.selected)

    if (toNudge.length === 0) {
      return { skipped: true, reason: 'nothing_waiting_in_window', checked: candidates.length }
    }

    const { data: shows, error: showsError } = await admin
      .from('shows')
      .select('id, tour_id, venue_name, date, tours(account_id)')
      .in('id', toNudge.map((d) => d.showId))

    if (showsError) {
      console.error('[guest-list-nudge] shows lookup failed:', showsError.message)
      return { skipped: true, reason: 'shows_read_failed' }
    }

    const results: { show_id: string; outcome: string }[] = []

    for (const decision of toNudge) {
      const show = (shows as ShowRow[] | null)?.find((s) => s.id === decision.showId)
      if (!show) {
        results.push({ show_id: decision.showId, outcome: 'skipped_show_not_found' })
        continue
      }

      const accountId = show.tours?.account_id
      if (!accountId) {
        results.push({ show_id: decision.showId, outcome: 'skipped_no_account' })
        continue
      }

      const rendered = await registry.guest_list_doors_nudge.telegram!({
        venueName: show.venue_name,
        showDate: formatShowDate(show.date),
        waitingCount: waitingCountByShow.get(decision.showId) ?? 0,
      })

      const result = await notifyAccount({
        tourId: show.tour_id,
        accountId,
        type: 'guest_list_doors_nudge',
        dedupDimension: `${show.id}:doors`,
        rendered,
      })

      results.push({ show_id: decision.showId, outcome: result.outcome })
    }

    return {
      checked: candidates.length,
      nudged: results.filter((r) => r.outcome === 'sent').length,
      results,
    }
  },
})
