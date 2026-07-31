import { redirect } from 'next/navigation'
import { getScheduleShell, defaultScheduleDate } from '@/lib/schedule/schedule-shell'
import { DateSidebar } from '@/components/schedule/date-sidebar'

// The Dates panel for the schedule route, rendered into the @secondaryPanel
// slot declared in app/(app)/layout.tsx. This is a layout, not a page, so it
// does not receive searchParams and is not re-rendered when ?date= changes:
// Next.js preserves it across date clicks the same way any layout persists
// across nested page navigations. The trivial page.tsx alongside it is the
// required routable leaf; it renders nothing.
export default async function ScheduleSecondaryPanelLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // Shared via React.cache with the main route's layout/page, so this does
  // not issue a second query.
  const { tour, dates } = await getScheduleShell(id)

  if (!tour) redirect('/')

  return (
    <>
      <DateSidebar tourId={id} dates={dates} defaultDate={defaultScheduleDate(dates)} />
      {children}
    </>
  )
}
