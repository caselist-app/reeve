import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getScheduleShell, defaultScheduleDate } from '@/lib/schedule/schedule-shell'
import { DayContent } from '@/components/schedule/day-content'
import { DayContentSkeleton } from '@/components/schedule/schedule-skeleton'

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: dateParam } = await searchParams

  // Shared with the layout via React.cache, so this does not re-query.
  const { tour, dates } = await getScheduleShell(id)

  if (!tour) redirect('/')

  const selectedDate = dateParam ?? defaultScheduleDate(dates)
  const tourDate = dates.find((d) => d.date === selectedDate) ?? null
  const tz = tour.timezone ?? 'UTC'

  // No key on the boundary: a date change is a transition, so React holds the
  // current day on screen (no skeleton flash) and swaps it when the new day
  // resolves. The skeleton only shows on the first load, when there is nothing
  // to hold. The sidebar highlight still moves instantly via the URL.
  return (
    <Suspense fallback={<DayContentSkeleton />}>
      <DayContent
        tourId={id}
        tourName={tour.name}
        timezone={tz}
        selectedDate={selectedDate}
        tourDate={tourDate}
        dates={dates}
      />
    </Suspense>
  )
}
