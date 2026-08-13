import { NotesTextarea } from '@/components/schedule/notes-textarea'
import { VenueBlock } from '@/components/schedule/venue-block'
import { GuestListBlock } from '@/components/schedule/guest-list-block'
import { AddVenueButton } from '@/components/schedule/add-venue-button'
import { HotelBlock } from '@/components/schedule/hotel-block'
import type { DayShow } from '@/lib/schedule/day-records'
import type { DayType } from '@/lib/schedule/day-link'
import { venueSectionState } from '@/lib/schedule/day-info-venue'
import type { GuestListSummary } from '@/lib/schedule/guest-list-summary'
import type { DayHotel } from '@/lib/schedule/day-hotel'

interface DayInfoPanelProps {
  tourId: string
  // Null when the selected date is not a day of the tour: no day type, so the
  // venue section is absent.
  tourDateId: string | null
  dayType: DayType | null
  date: string
  show: DayShow | null
  dayNotes: string | null
  // The guest list count for the block under Venue, resolved in DayContent.
  guestListSummary: GuestListSummary
  // The night's hotel, resolved once in DayContent (resolveHotelForDay). Null
  // when no hotel resolves for this day: the whole section is then absent,
  // deliberately, with no empty state and no add-hotel affordance (a separate,
  // not-yet-built brief's door).
  hotel: DayHotel | null
}

export function DayInfoPanel({ tourId, tourDateId, dayType, date, show, dayNotes, guestListSummary, hotel }: DayInfoPanelProps) {
  // The venue section is conditional on the day type. It is absent on a travel
  // day, a press day, a rehearsal day and a day off as a matter of fact: those
  // days have no venue to have, so there is nothing to say. Do not restore a
  // sentence for them.
  const venue = dayType ? venueSectionState(dayType, show !== null) : { kind: 'absent' as const }

  return (
    <div data-testid="day-info-panel" className="flex flex-col h-full px-4 lg:pr-6 py-4 gap-5 overflow-y-auto">
      {/* Venue. Clickable since Brief 36 step 6: this is the way into a show's
          venue detail now that the show page is gone. */}
      {venue.kind === 'venue' && show && (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Venue
          </p>
          <VenueBlock tourId={tourId} show={show} />
          {/* Guest list sits directly under Venue: it hangs off the show, so it
              only exists where a show does. Brief 52, step 4. */}
          <GuestListBlock
            tourId={tourId}
            showId={show.id}
            venueName={show.venue_name}
            summary={guestListSummary}
          />
        </section>
      )}
      {venue.kind === 'needs-venue' && tourDateId && (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Venue
          </p>
          <p className="text-xs text-muted-foreground">No venue yet.</p>
          <AddVenueButton tourId={tourId} tourDateId={tourDateId} date={date} notes={dayNotes} />
        </section>
      )}

      {/* Notes: saves on blur, no save button. */}
      <section className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Notes
        </p>
        <NotesTextarea tourId={tourId} date={date} initialValue={dayNotes ?? ''} />
      </section>

      {/* Hotel. Read-only: name and check-in time, opening the existing hotel
          side panel on click. Absent, with no empty state, when no hotel
          resolves for this day. */}
      {hotel && (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Hotel
          </p>
          <HotelBlock hotel={hotel} />
        </section>
      )}
    </div>
  )
}
