import type { createClient } from '@/lib/supabase/server'
import { passTypeLabel } from '@/lib/guest-list/vocabulary'
import type { Tables } from '@/lib/types/database'

// The counted facts the day-info Guest list block shows, plus the pure helpers
// the panel reuses for its allotment lines. Brief 52, step 4 (REE-131).
//
// The pure parts (summarise, waitingPhrase, allotmentLines) are separated from
// the fetch deliberately: no component in this repo can be render-tested (no
// @testing-library, no jsdom), so the counting, the singular/plural and the
// over-allotment wording have to live in functions a unit test can call
// directly. tests/unit/guest-list-summary.test.ts pins all three.
//
// The pure helpers here are imported by the client block and panel, so this
// module must not runtime-import lib/supabase/server (next/headers would break
// the client bundle). createClient is imported as a type only, and
// fetchGuestListSummary takes the client as a parameter, the same shape as
// fetchDayRecords and fetchDayRoster: DayContent already has one and passes it in.

type Client = Awaited<ReturnType<typeof createClient>>

// What counts as a name on the door: approved (confirmed) plus requested (a chat
// request the TM has not actioned yet, still holding a provisional spot). draft
// is an in-progress chat request the TM never sees; declined and removed are off
// the list. The fetch filters to these two with a literal .in() below (a bare
// const would trip the unguarded-in check); summarise re-checks them so the pure
// function does not depend on the caller having filtered.
type SummaryEntry = Pick<Tables<'guest_list_entries'>, 'status' | 'num_tickets' | 'pass_type'>
type SummaryAllotment = Pick<Tables<'guest_list_allotments'>, 'pass_type' | 'num_allowed'>

export interface GuestListSummary {
  // A failed read is an error, never a confident zero. The block renders
  // "Could not load the guest list" on a non-null error rather than
  // "Guest list, 0", which is the confident-plausible-wrong answer a failed
  // query must never become.
  error: string | null
  // Names on the list: approved plus requested, one per row regardless of ticket
  // count. This is a headcount of the door, not a ticket tally.
  total: number
  // Of those, the ones still waiting on the TM to approve or decline.
  waiting: number
}

// The two counts from a show's on-list entries. Draft, declined and removed rows
// are excluded here as a backstop; the fetch already filters to on-list statuses,
// but the pure function must not depend on the caller having done that.
export function summarise(entries: SummaryEntry[]): { total: number; waiting: number } {
  let total = 0
  let waiting = 0
  for (const entry of entries) {
    if (entry.status === 'approved' || entry.status === 'requested') total += 1
    if (entry.status === 'requested') waiting += 1
  }
  return { total, waiting }
}

// "1 waiting", "3 waiting". The count is a gerund, so the noun does not inflect;
// the phrase exists as its own function so the singular case is pinned and the
// block and the panel say it the same way.
export function waitingPhrase(waiting: number): string {
  return `${waiting} waiting`
}

// "12 names", "1 name", "No names yet". The block's one-line summary of the door.
export function guestCountPhrase(total: number): string {
  if (total === 0) return 'No names yet'
  return `${total} ${total === 1 ? 'name' : 'names'}`
}

export interface AllotmentLine {
  // Raw pass_type value, so the panel can key on it.
  passType: string
  // "10 of 8 tickets": approved tickets against the promoter's allotment.
  label: string
  // Approved tickets exceed the allotment. The panel tints the line, it never
  // blocks: an over-allotment is a fact the TM decides on, same as decide.ts,
  // which warns after an approve rather than refusing it.
  over: boolean
}

// One line per allotment row, never per pass type seen on the list. A show with
// no allotment rows has no limits and returns no lines: "no allotments" is
// silence, not "0 of 0", which would read as a limit of zero rather than none.
//
// Usage is approved tickets only, matching the over-allotment warning in
// lib/guest-list/decide.ts: a requested name has no ticket committed against the
// allotment yet.
export function allotmentLines(
  entries: SummaryEntry[],
  allotments: SummaryAllotment[],
): AllotmentLine[] {
  return allotments.map((allotment) => {
    const used = entries
      .filter((entry) => entry.status === 'approved' && entry.pass_type === allotment.pass_type)
      .reduce((sum, entry) => sum + (entry.num_tickets ?? 0), 0)

    return {
      passType: allotment.pass_type,
      label: `${used} of ${allotment.num_allowed} ${pluralPass(allotment.pass_type)}`,
      over: used > allotment.num_allowed,
    }
  })
}

// The pass type's noun, lowercased and pluralised for the allotment line: a
// count of eight is always plural. "ticket" -> "tickets", "photo pass" ->
// "photo passes". A value missing from the vocabulary falls back to its raw
// value via passTypeLabel, which is deliberately ugly so a bug looks like one.
function pluralPass(passType: string): string {
  const label = passTypeLabel(passType).toLowerCase()
  return label.endsWith('s') ? `${label}es` : `${label}s`
}

// The block's read. Lean by design: it selects only the three columns the counts
// need, and returns zeros with no query at all when there is no show on the day,
// so the day-content Promise.all can call it unconditionally.
export async function fetchGuestListSummary(
  supabase: Client,
  showId: string | null,
): Promise<GuestListSummary> {
  if (!showId) return { error: null, total: 0, waiting: 0 }

  const { data, error } = await supabase
    .from('guest_list_entries')
    .select('status, num_tickets, pass_type')
    .eq('show_id', showId)
    .in('status', ['requested', 'approved'])

  if (error) {
    console.error('[guest-list] could not load the summary:', error.message)
    return { error: 'Could not load the guest list.', total: 0, waiting: 0 }
  }

  return { error: null, ...summarise(data ?? []) }
}
