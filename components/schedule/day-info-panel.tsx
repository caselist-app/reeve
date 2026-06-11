import { createClient } from '@/lib/supabase/server'
import { NotesTextarea } from '@/components/schedule/notes-textarea'

interface DayInfoPanelProps {
  tourId: string
  date: string
  tourDateId: string | null
  timezone: string
}

function formatCheckTime(timeStr: string | null): string {
  if (!timeStr) return ''
  return String(timeStr).slice(0, 5)
}

export async function DayInfoPanel({ tourId, date, tourDateId, timezone }: DayInfoPanelProps) {
  const supabase = await createClient()

  // Fetch show for this date (if any).
  const { data: shows } = tourDateId
    ? await supabase
        .from('shows')
        .select('id, venue_name, address, capacity, venue_type, notes')
        .eq('tour_id', tourId)
        .eq('tour_date_id', tourDateId)
    : { data: [] as Array<{ id: string; venue_name: string; address: string | null; capacity: number | null; venue_type: string | null; notes: string | null }> }

  const show = shows?.[0] ?? null

  // For non-show days, fetch the __day_notes__ sentinel row.
  const { data: dayNotesRow } = !show
    ? await supabase
        .from('day_events')
        .select('notes')
        .eq('tour_id', tourId)
        .eq('date', date)
        .eq('title', '__day_notes__')
        .maybeSingle()
    : { data: null }

  // Roster: people assigned via transport or hotel on this date.
  const [{ data: transportPeople }, { data: hotelPeople }] = await Promise.all([
    supabase
      .from('transport_assignments')
      .select('people(id, name, person_type)')
      .eq('tour_id', tourId)
      .in(
        'segment_id',
        tourDateId
          ? (await supabase
              .from('transport_segments')
              .select('id')
              .eq('tour_id', tourId)
              .eq('tour_date_id', tourDateId)
              .then((r) => (r.data ?? []).map((s) => s.id))
            )
          : [],
      ),
    supabase
      .from('room_assignments')
      .select('people(id, name, person_type)')
      .eq('tour_id', tourId)
      .in(
        'hotel_stay_id',
        tourDateId
          ? (await supabase
              .from('hotel_stays')
              .select('id')
              .eq('tour_id', tourId)
              .eq('tour_date_id', tourDateId)
              .then((r) => (r.data ?? []).map((s) => s.id))
            )
          : [],
      ),
  ])

  // Deduplicate roster by person id.
  type RosterPerson = { id: string; name: string; person_type: string }
  const rosterMap = new Map<string, RosterPerson>()
  for (const row of [...(transportPeople ?? []), ...(hotelPeople ?? [])]) {
    const p = Array.isArray(row.people) ? row.people[0] : row.people
    if (p && !rosterMap.has(p.id)) {
      rosterMap.set(p.id, { id: p.id, name: p.name, person_type: p.person_type })
    }
  }
  const roster = Array.from(rosterMap.values())
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
            initialValue={dayNotesRow?.notes ?? ''}
          />
        )}
      </section>
    </div>
  )
}
