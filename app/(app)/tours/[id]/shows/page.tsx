import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ScheduleView } from '@/components/schedule/schedule-view'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import type { ScheduleDateRow } from '@/components/schedule/schedule-view'

export default async function SchedulePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: tour }, { data: tourDates }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, artists(name), timezone')
      .eq('id', id)
      .eq('account_id', user.id)
      .single(),
    supabase
      .from('tour_dates')
      .select(`
        id,
        date,
        day_type,
        notes,
        shows (id, venue_name, address, load_in_at),
        rehearsals (id, location_name),
        transport_segments (id, mode, origin, destination, depart_at)
      `)
      .eq('tour_id', id)
      .order('date', { ascending: true }),
  ])

  if (!tour) redirect('/')

  const dates: ScheduleDateRow[] = (tourDates ?? []).map((d) => ({
    id: d.id,
    date: d.date,
    day_type: d.day_type as ScheduleDateRow['day_type'],
    notes: d.notes,
    shows: Array.isArray(d.shows) ? d.shows : d.shows ? [d.shows] : [],
    rehearsals: Array.isArray(d.rehearsals) ? d.rehearsals : d.rehearsals ? [d.rehearsals] : [],
    transport_segments: Array.isArray(d.transport_segments)
      ? d.transport_segments
      : d.transport_segments
      ? [d.transport_segments]
      : [],
  }))

  return (
    <PageLayout>
      <PageHeader eyebrow={tour.artists?.name ?? ''} title={tour.name} />
      <ScheduleView tourId={id} dates={dates} timezone={tour.timezone} />
    </PageLayout>
  )
}
