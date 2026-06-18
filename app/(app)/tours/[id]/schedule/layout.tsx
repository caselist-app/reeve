import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getScheduleShell, defaultScheduleDate } from '@/lib/schedule/schedule-shell'
import { DateSidebar } from '@/components/schedule/date-sidebar'
import { SidebarSkeleton } from '@/components/schedule/schedule-skeleton'

// The date sidebar lives in the layout so Next.js preserves it across ?date=
// navigations: clicking a date re-renders only the page (the day content),
// while the sidebar stays mounted. The highlight updates client-side.
export default async function ScheduleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { tour, dates } = await getScheduleShell(id)

  if (!tour) redirect('/')

  return (
    <div className="flex h-full overflow-hidden">
      <Suspense fallback={<SidebarSkeleton />}>
        <DateSidebar tourId={id} dates={dates} defaultDate={defaultScheduleDate(dates)} />
      </Suspense>
      {children}
    </div>
  )
}
