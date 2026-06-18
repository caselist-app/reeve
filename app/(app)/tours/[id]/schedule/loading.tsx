import { DayContentSkeleton } from '@/components/schedule/schedule-skeleton'

// The sidebar is rendered by the layout and stays put; only the day content
// shows a skeleton while the page resolves.
export default function ScheduleLoading() {
  return <DayContentSkeleton />
}
