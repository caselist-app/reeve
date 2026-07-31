import { redirect } from 'next/navigation'
import { getScheduleShell } from '@/lib/schedule/schedule-shell'

// The Dates list itself now renders in the app/(app)/@secondaryPanel slot
// (app/(app)/@secondaryPanel/tours/[id]/schedule/layout.tsx) as its own
// standalone card, not inline here. This layout just guards the route.
export default async function ScheduleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { tour } = await getScheduleShell(id)

  if (!tour) redirect('/')

  return <div className="flex h-full overflow-hidden">{children}</div>
}
