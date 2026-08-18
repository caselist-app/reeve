'use client'

import { ChevronRight } from 'lucide-react'
import Image from 'next/image'
import { useSidePanel } from '@/stores/side-panel-store'
import type { DayShow } from '@/lib/schedule/day-records'
import { staticMapUrl, googleMapsUrl, STATIC_MAP_WIDTH, STATIC_MAP_HEIGHT } from '@/lib/schedule/venue-map'

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
// day-calendar.tsx does.
//
// Title and map are two separate elements, not one nested inside the other: an
// anchor inside a button is invalid HTML, and the two open different things
// anyway (the side panel vs. Google Maps in a new tab). REE-178 dropped the
// address and capacity lines; the header already shows capacity on show days,
// and the map replaces the address as the at-a-glance location cue. With no
// cached coordinates there is no map and no placeholder, since a show whose
// venue has not resolved yet has nothing worth showing in its place.
export function VenueBlock({ tourId, show }: VenueBlockProps) {
  const { open } = useSidePanel()
  const hasCoordinates = show.venue_lat != null && show.venue_lng != null

  return (
    <div className="-mx-2 space-y-1.5">
      <button
        type="button"
        onClick={() =>
          open({ type: 'venue', tourId, showId: show.id, venueName: show.venue_name })
        }
        className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold">{show.venue_name}</span>
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          view
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {hasCoordinates && (
        <a
          href={googleMapsUrl(show.venue_lat as number, show.venue_lng as number)}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg px-2"
        >
          <Image
            src={staticMapUrl(show.venue_lat as number, show.venue_lng as number)}
            alt={`Map of ${show.venue_name}`}
            width={STATIC_MAP_WIDTH}
            height={STATIC_MAP_HEIGHT}
            className="h-auto w-full rounded-lg"
          />
        </a>
      )}
    </div>
  )
}
