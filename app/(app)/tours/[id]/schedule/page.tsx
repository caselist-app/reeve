import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getScheduleShell, defaultScheduleDate } from '@/lib/schedule/schedule-shell'
import { resolveTimezone } from '@/lib/schedule/datetime'
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

  const selectedDate = dateParam ?? defaultScheduleDate(dates, tour.timezone ?? 'UTC')
  const tourDate = dates.find((d) => d.date === selectedDate) ?? null
  // The grid and its gutter labels render in the day's own venue timezone once
  // resolveHub has resolved one (REE-246, Brief 56: a Perth show on a Sydney
  // tour renders in Perth time). Falls back to the tour's for a day with no
  // show, or one still waiting on hub resolution.
  const tz = resolveTimezone(tourDate?.shows?.[0] ?? { timezone: null }, tour.timezone)

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
