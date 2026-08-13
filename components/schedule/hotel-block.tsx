'use client'

import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import type { DayHotel } from '@/lib/schedule/day-hotel'
import { staticMapUrl, googleMapsUrl } from '@/lib/schedule/venue-map'

interface HotelBlockProps {
  tourId: string
  hotel: DayHotel
}

// The Hotel block in the day info panel: name and check-in time, opening the
// existing hotel side panel on click. Same thin-client-that-calls-useSidePanel
// shape as VenueBlock, so day-info-panel.tsx stays a Server Component. REE-179.
// The map below the button mirrors VenueBlock's REE-178 treatment: REE-206.
export function HotelBlock({ tourId, hotel }: HotelBlockProps) {
  const { open } = useSidePanel()
  const hasCoordinates = hotel.lat != null && hotel.lng != null

  return (
    <div className="-mx-2 space-y-1.5">
      <button
        type="button"
        onClick={() => open({ type: 'hotel', key: `hotel:${hotel.id}`, tourId, stay: hotel })}
        className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{hotel.name}</p>
          {hotel.check_in_time && (
            <p className="text-xs text-muted-foreground">
              Check-in {hotel.check_in_time.slice(0, 5)}
            </p>
          )}
        </div>
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          view
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>

      {hasCoordinates && (
        <a
          href={googleMapsUrl(hotel.lat as number, hotel.lng as number)}
          target="_blank"
          rel="noopener noreferrer"
          className="block overflow-hidden rounded-lg px-2"
        >
          <img
            src={staticMapUrl(hotel.lat as number, hotel.lng as number)}
            alt={`Map of ${hotel.name ?? 'Hotel'}`}
            className="h-auto w-full rounded-lg"
          />
        </a>
      )}
    </div>
  )
}
