import { ChevronUp, MapPin, Users, NotebookPen } from 'lucide-react'
import type { DayShow } from '@/lib/schedule/day-records'
import type { RosterPerson } from '@/lib/schedule/day-roster'

interface DayInfoDockProps {
  show: DayShow | null
  roster: RosterPerson[]
  dayNotes: string | null
}

// Compact, always-visible day summary shown at the bottom of the mobile day
// view. Presentational only: the wrapping button in DayViewClient handles the
// tap that opens the full day info sheet. Data is resolved in DayContent.
export function DayInfoDock({ show, roster, dayNotes }: DayInfoDockProps) {
  const count = roster.length
  const notes = (show?.notes ?? dayNotes ?? '').trim()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Day info
        </span>
        <ChevronUp className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex flex-col gap-1.5">
        {show?.venue_name && (
          <span className="flex items-center gap-2 text-[13px] text-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{show.venue_name}</span>
          </span>
        )}

        {count > 0 && (
          <span className="flex items-center gap-2 text-[13px] text-foreground">
            <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {count} {count === 1 ? 'person' : 'people'} on this day
          </span>
        )}

        <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{notes || 'Add a note for the day'}</span>
        </span>
      </div>
    </div>
  )
}
