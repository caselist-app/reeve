import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'
import type { Department, AdvanceStatus } from '@/lib/shows/advance'

// The per-department statuses the day-info Advance block shows, plus the pure
// row-mapping helper the fetch reuses. REE-257, the same split as
// lib/schedule/guest-list-summary.ts (REE-131): no component in this repo can
// be render-tested, so the row-to-department mapping lives in a function a
// unit test can call directly. tests/unit/advance-summary.test.ts pins it.
//
// The pure part is imported by the client block, so this module must not
// runtime-import lib/supabase/server (next/headers would break the client
// bundle). createClient is imported as a type only, and fetchAdvanceSummary
// takes the client as a parameter, the same shape as fetchGuestListSummary.

type Client = Awaited<ReturnType<typeof createClient>>

type SummaryRow = Pick<
  Tables<'show_advance'>,
  'status_production' | 'status_lx' | 'status_hospitality'
>

export type AdvanceStatuses = Record<Department, AdvanceStatus>

export interface AdvanceSummary {
  // A failed read is an error, never a confident "not started" across all five
  // chips. The block renders "Could not load the advance" on a non-null error
  // rather than five plausible, wrong statuses.
  error: string | null
  statuses: AdvanceStatuses
}

// A show with no show_advance row yet (nothing has been touched) reads as
// every department not started, the same "nothing to say" default the column
// itself would produce once a row exists.
const DEFAULT_STATUSES: AdvanceStatuses = {
  production: 'not_started',
  lx: 'not_started',
  hospitality: 'not_started',
}

// Maps one show_advance query result to the summary the block renders,
// including the error branch, so a query error is pinned by a unit test the
// same way the row mapping is: no live Supabase client needed, since the test
// can hand this function a row, an error, or neither.
//
// A null row with no error (no show_advance yet for this show) maps to all
// not_started. An error maps to the error shape regardless of row, since a
// failed read must never render as three confident, plausible, wrong statuses.
export function summarise(row: SummaryRow | null, error: { message: string } | null): AdvanceSummary {
  if (error) return { error: 'Could not load the advance.', statuses: DEFAULT_STATUSES }
  if (!row) return { error: null, statuses: DEFAULT_STATUSES }

  return {
    error: null,
    statuses: {
      production: (row.status_production as AdvanceStatus) ?? 'not_started',
      lx: (row.status_lx as AdvanceStatus) ?? 'not_started',
      hospitality: (row.status_hospitality as AdvanceStatus) ?? 'not_started',
    },
  }
}

// The block's read. Lean by design: it selects only the three status columns
// for one show, and returns the all-not-started default with no query at all
// when there is no show on the day, so the day-content Promise.all can call
// it unconditionally, the same shape as fetchGuestListSummary.
//
// Deliberately not a trim of getShowAdvance in lib/actions/shows.ts: that
// function is four queries for the panel's riders and shares, and is
// intentionally deferred to panel-open. This runs on every day view, so it
// needs its own one-query fetcher.
export async function fetchAdvanceSummary(
  supabase: Client,
  showId: string | null,
): Promise<AdvanceSummary> {
  if (!showId) return { error: null, statuses: DEFAULT_STATUSES }

  const { data, error } = await supabase
    .from('show_advance')
    .select('status_production, status_lx, status_hospitality')
    .eq('show_id', showId)
    .maybeSingle()

  if (error) console.error('[advance] could not load the summary:', error.message)

  return summarise(data, error)
}
