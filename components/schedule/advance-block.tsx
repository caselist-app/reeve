'use client'

import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { useAdvanceStatuses } from '@/stores/advance-status-store'
// DEPARTMENT_LABELS and Department come from lib/shows/departments directly,
// not the lib/shows/advance barrel: advance.ts imports lib/supabase/admin
// ('server-only'), which breaks this client component's bundle if pulled in
// as a runtime import. AdvanceStatus has no such issue since it is type-only.
import { DEPARTMENT_LABELS, type Department } from '@/lib/shows/departments'
import type { AdvanceStatus } from '@/lib/shows/advance'
import type { AdvanceSummary } from '@/lib/schedule/advance-summary'

interface AdvanceBlockProps {
  tourId: string
  showId: string
  venueName: string
  summary: AdvanceSummary
}

// Chip colours reuse AdvanceTracker's convention (components/shows/advance-tracker.tsx)
// so the two surfaces read the same status the same way.
const STATUS_STYLES: Record<AdvanceStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-amber-100 text-amber-800',
  done: 'bg-green-100 text-green-800',
}

// Departments in DEPARTMENT_LABELS' own order (audio, lighting, staging,
// hospitality, travel), read from the object rather than restated as a list.
const DEPARTMENTS = Object.keys(DEPARTMENT_LABELS) as Department[]

// The Advance block in day info: five read-only status chips, matching the
// mini-panel shape REE-48 defines (a label, a short body of derived facts, at
// most one action, no card token of its own, read-only). Editing still only
// happens in the advance panel. REE-257.
//
// A thin client button, the same shape as guest-list-block.tsx: day-info-panel
// stays a Server Component and the clickable piece is a small client that
// calls useSidePanel itself. The whole block opens the advance panel, the
// same descriptor the venue panel's Advance button already uses; there is no
// separate action button, just the "view" chevron every other block uses.
//
// The chips come from the server (`summary`) on first paint, but track
// AdvanceTracker through an optimistic store rather than a server refresh.
// The tracker lives in the app layout above this route, so a revalidate or
// refresh from it does not reliably repaint this block (REE-65, the same trap
// as guest list, REE-131). Instead the tracker writes the statuses it just
// confirmed into the store, and this reads it. Fresh server data clears the
// override, so the server wins again on the next navigation.
export function AdvanceBlock({ tourId, showId, venueName, summary }: AdvanceBlockProps) {
  const { open } = useSidePanel()
  const override = useAdvanceStatuses((s) => s.statuses[showId])
  const clear = useAdvanceStatuses((s) => s.clear)

  // A new server summary (a navigation, or a revalidate that did land) is the
  // source of truth: drop the optimistic override so an external change is not
  // shadowed. Keyed on the primitive fields so it fires only when a status
  // actually moves, not on every re-render.
  useEffect(() => {
    clear(showId)
  }, [
    showId,
    summary.error,
    summary.statuses.audio,
    summary.statuses.lighting,
    summary.statuses.staging,
    summary.statuses.hospitality,
    summary.statuses.travel,
    clear,
  ])

  const statuses = override ?? (summary.error ? null : summary.statuses)

  return (
    <button
      type="button"
      aria-label="Advance"
      onClick={() => open({ type: 'advance', tourId, showId, venueName })}
      className="group -mx-2 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        {statuses === null ? (
          // A failed read says so rather than rendering five "not started"
          // chips, the confident, plausible, wrong answer a failed query must
          // never be.
          <span className="block text-sm font-semibold text-destructive">
            Could not load the advance
          </span>
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {DEPARTMENTS.map((department) => (
              <span
                key={department}
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  STATUS_STYLES[statuses[department]]
                )}
              >
                {DEPARTMENT_LABELS[department]}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        view
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
