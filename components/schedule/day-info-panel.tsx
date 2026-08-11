import { NotesTextarea } from '@/components/schedule/notes-textarea'
import { VenueBlock } from '@/components/schedule/venue-block'
import { GuestListBlock } from '@/components/schedule/guest-list-block'
import { AddVenueButton } from '@/components/schedule/add-venue-button'
import type { DayShow } from '@/lib/schedule/day-records'
import type { RosterPerson } from '@/lib/schedule/day-roster'
import type { DayType } from '@/lib/schedule/day-link'
import { venueSectionState } from '@/lib/schedule/day-info-venue'
import type { GuestListSummary } from '@/lib/schedule/guest-list-summary'

interface DayInfoPanelProps {
  tourId: string
  // Null when the selected date is not a day of the tour: no day type, so the
  // venue section is absent.
  tourDateId: string | null
  dayType: DayType | null
  date: string
  show: DayShow | null
  dayNotes: string | null
  // Resolved once in DayContent (fetchDayRoster) and shared with the bottom dock.
  roster: RosterPerson[]
  // The guest list count for the block under Venue, resolved in DayContent.
  guestListSummary: GuestListSummary
}

export function DayInfoPanel({ tourId, tourDateId, dayType, date, show, dayNotes, roster, guestListSummary }: DayInfoPanelProps) {
  const rosterPreview = roster.slice(0, 4)
  const rosterOverflow = roster.length - rosterPreview.length

  // The venue section is conditional on the day type. It is absent on a travel
  // day, a press day, a rehearsal day and a day off as a matter of fact: those
  // days have no venue to have, so there is nothing to say. Do not restore a
  // sentence for them.
  const venue = dayType ? venueSectionState(dayType, show !== null) : { kind: 'absent' as const }

  return (
    <div className="flex flex-col h-full px-4 py-4 gap-5 overflow-y-auto">
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

      {/* Roster */}
      {roster.length > 0 && (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Roster
          </p>
          <div className="space-y-1.5">
            {rosterPreview.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase">
                  {p.name.slice(0, 2)}
                </span>
                <span className="text-xs font-medium truncate">{p.name}</span>
              </div>
            ))}
            {rosterOverflow > 0 && (
              <p className="text-xs text-muted-foreground pl-8">+{rosterOverflow} more</p>
            )}
          </div>
        </section>
      )}

      {/* Notes: saves on blur, no save button. */}
      <section className="flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Notes
        </p>
        <NotesTextarea tourId={tourId} date={date} initialValue={dayNotes ?? ''} />
      </section>
    </div>
  )
}
