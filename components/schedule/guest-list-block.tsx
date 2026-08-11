'use client'

import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { useGuestCounts } from '@/stores/guest-list-count-store'
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
// A thin client button, the same shape as venue-block.tsx: day-info-panel stays
// a Server Component and the clickable pieces are small clients that call
// useSidePanel themselves.
//
// The count comes from the server (`summary`) on first paint, but tracks the
// guest list panel through an optimistic store rather than a server refresh. The
// panel is mounted in the app layout above this route, so a revalidate or refresh
// from it does not reliably repaint this block (REE-65). Instead the panel writes
// the count it just re-read into the store, and this reads it. Fresh server data
// clears the override, so the server wins again on the next navigation.
export function GuestListBlock({ tourId, showId, venueName, summary }: GuestListBlockProps) {
  const { open } = useSidePanel()
  const override = useGuestCounts((s) => s.counts[showId])
  const clear = useGuestCounts((s) => s.clear)

  // A new server summary (a navigation, or a revalidate that did land) is the
  // source of truth: drop the optimistic override so an external change is not
  // shadowed. While the panel mutates and the server prop is unchanged, the
  // override drives the count. Keyed on the primitive fields so it fires only when
  // the count actually moves, not on every re-render.
  useEffect(() => {
    clear(showId)
  }, [showId, summary.total, summary.waiting, summary.error, clear])

  const count = override ?? (summary.error ? null : { total: summary.total, waiting: summary.waiting })

  return (
    <button
      type="button"
      onClick={() => open({ type: 'guest-list', tourId, showId, venueName })}
      className="group -mx-2 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Guest list</span>
        {count === null ? (
          // A failed read says so rather than rendering "Guest list, 0", which is
          // the confident, plausible, wrong answer a failed query must never be.
          <span className="mt-0.5 block text-xs text-destructive">
            Could not load the guest list
          </span>
        ) : (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {guestCountPhrase(count.total)}
            {count.waiting > 0 && `, ${waitingPhrase(count.waiting)}`}
          </span>
        )}
      </span>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
