import { cache } from 'react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

// Shared shell data for the schedule route: the tour and its full date list.
// Wrapped in React.cache so the layout (which renders the sidebar) and the page
// (which resolves the selected day) share a single query within one request.
export const getScheduleShell = cache(async (tourId: string) => {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: tour }, { data: tourDates }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, timezone')
      .eq('id', tourId)
      .eq('account_id', user.id)
      .single(),
    supabase
      .from('tour_dates')
      .select(`
        id, date, day_type, notes, custom_title,
        shows ( venue_name, address ),
        rehearsals ( location_name ),
        transport_segments ( mode, origin, destination, depart_at )
      `)
      .eq('tour_id', tourId)
      .order('date', { ascending: true }),
  ])

  return { tour, dates: tourDates ?? [] }
})

// The day shown when no ?date= is present: today if it falls inside the tour,
// otherwise the first date. Used by both the layout (sidebar highlight) and the
// page (selected day) so they always agree.
export function defaultScheduleDate(dates: { date: string }[]): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dates.some((d) => d.date === today)) return today
  return dates[0]?.date ?? today
}
