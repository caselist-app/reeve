import { NotesTextarea } from '@/components/schedule/notes-textarea'
import type { DayShow } from '@/lib/schedule/day-records'
import type { RosterPerson } from '@/lib/schedule/day-roster'

interface DayInfoPanelProps {
  tourId: string
  date: string
  show: DayShow | null
  dayNotes: string | null
  // Resolved once in DayContent (fetchDayRoster) and shared with the bottom dock.
  roster: RosterPerson[]
}

export function DayInfoPanel({ tourId, date, show, dayNotes, roster }: DayInfoPanelProps) {
  const rosterPreview = roster.slice(0, 4)
  const rosterOverflow = roster.length - rosterPreview.length

  return (
    <div className="flex flex-col h-full px-4 py-4 gap-5 overflow-y-auto">
      {/* Venue */}
      {show ? (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Venue
          </p>
          <p className="text-sm font-semibold">{show.venue_name}</p>
          {show.address && (
            <p className="text-xs text-muted-foreground mt-0.5">{show.address}</p>
          )}
          {show.capacity != null && (
            <p className="text-xs text-muted-foreground mt-0.5">Cap. {show.capacity.toLocaleString()}</p>
          )}
        </section>
      ) : (
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Day info
          </p>
          <p className="text-xs text-muted-foreground">No show on this date.</p>
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
        {show ? (
          <NotesTextarea
            showId={show.id}
            initialValue={show.notes ?? ''}
          />
        ) : (
          <NotesTextarea
            tourId={tourId}
            date={date}
            initialValue={dayNotes ?? ''}
          />
        )}
      </section>
    </div>
  )
}
