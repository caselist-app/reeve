'use client'

import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { guestCountPhrase, waitingPhrase, type GuestListSummary } from '@/lib/schedule/guest-list-summary'

interface GuestListBlockProps {
  tourId: string
  showId: string
  venueName: string
  summary: GuestListSummary
}

// The Guest list block in day info, directly under Venue and rendered only on a
// show day with a show. Brief 52, step 4 (REE-131).
//
// A thin client button, the same shape as venue-block.tsx and for the same
// reason: day-info-panel stays a Server Component and the clickable pieces are
// small clients that call useSidePanel themselves. The counts are resolved
// server-side in DayContent and handed in, so this component only opens the panel.
export function GuestListBlock({ tourId, showId, venueName, summary }: GuestListBlockProps) {
  const { open } = useSidePanel()

  return (
    <button
      type="button"
      onClick={() => open({ type: 'guest-list', tourId, showId, venueName })}
      className="group -mx-2 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Guest list</span>
        {summary.error ? (
          // A failed read says so rather than rendering "Guest list, 0", which is
          // the confident, plausible, wrong answer a failed query must never be.
          <span className="mt-0.5 block text-xs text-destructive">
            Could not load the guest list
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {guestCountPhrase(summary.total)}
            {summary.waiting > 0 && `, ${waitingPhrase(summary.waiting)}`}
          </span>
        )}
      </span>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
