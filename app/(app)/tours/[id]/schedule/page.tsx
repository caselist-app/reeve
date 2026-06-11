import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { DateSidebar } from '@/components/schedule/date-sidebar'
import { DayTimeline } from '@/components/schedule/day-timeline'
import { DayInfoPanel } from '@/components/schedule/day-info-panel'
import { DayViewClient } from '@/components/schedule/day-view-client'

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: dateParam } = await searchParams

  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: tour }, { data: tourDates }] = await Promise.all([
    supabase
      .from('tours')
      .select('id, name, timezone, artists(name)')
      .eq('id', id)
      .eq('account_id', user.id)
      .single(),
    supabase
      .from('tour_dates')
      .select('id, date, day_type, notes')
      .eq('tour_id', id)
      .order('date', { ascending: true }),
  ])

  if (!tour) redirect('/')

  const dates = tourDates ?? []
  const today = new Date().toISOString().slice(0, 10)

  // Default: today if a tour_dates row exists, else the first row.
  const selectedDate =
    dateParam ??
    (dates.some((d) => d.date === today) ? today : (dates[0]?.date ?? today))

  const tourDate = dates.find((d) => d.date === selectedDate) ?? null
  const tz = tour.timezone ?? 'UTC'

  return (
    <div className="flex h-full overflow-hidden">
      <DateSidebar
        tourId={id}
        dates={dates}
        selectedDate={selectedDate}
      />

      <DayViewClient
        timeline={
          tourDate ? (
            <DayTimeline
              tourId={id}
              tourDateId={tourDate.id}
              date={selectedDate}
              timezone={tz}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 py-10">
              <p className="text-sm text-muted-foreground">No data for this day.</p>
            </div>
          )
        }
        dayInfoPanel={
          <DayInfoPanel
            tourId={id}
            date={selectedDate}
            tourDateId={tourDate?.id ?? null}
            timezone={tz}
          />
        }
      />
    </div>
  )
}
