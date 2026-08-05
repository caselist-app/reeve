'use client'

import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import type { DayShow } from '@/lib/schedule/day-records'

interface VenueBlockProps {
  tourId: string
  show: DayShow
}

// The Venue block in the day info panel, and the only way into a show's venue
// detail now that the show page is gone.
//
// A thin client component rather than making day-info-panel one: the pattern in
// the day view is that the surface stays a Server Component and the clickable
// pieces are small clients that call useSidePanel themselves, the same way
// timeline-card.tsx does.
export function VenueBlock({ tourId, show }: VenueBlockProps) {
  const { open } = useSidePanel()

  return (
    <button
      type="button"
      onClick={() =>
        open({ type: 'venue', tourId, showId: show.id, venueName: show.venue_name })
      }
      className="group -mx-2 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{show.venue_name}</span>
        {show.address && (
          <span className="mt-0.5 block text-xs text-muted-foreground">{show.address}</span>
        )}
        {show.capacity != null && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            Cap. {show.capacity.toLocaleString()}
          </span>
        )}
      </span>
      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
