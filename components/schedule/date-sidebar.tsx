import Link from 'next/link'
import { cn } from '@/lib/utils'

interface TourDate {
  id: string
  date: string
  day_type: string
  notes: string | null
}

interface DateSidebarProps {
  tourId: string
  dates: TourDate[]
  selectedDate: string
}

// Colour pip per day type.
function pipClass(dayType: string): string {
  switch (dayType) {
    case 'show':      return 'bg-purple-500'
    case 'rehearsal': return 'bg-blue-500'
    case 'travel':    return 'bg-teal-500'
    case 'press':     return 'bg-amber-500'
    default:          return 'bg-stone-400'
  }
}

function formatSidebarDate(dateStr: string): { weekday: string; dayMonth: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
    dayMonth: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }
}

export function DateSidebar({ tourId, dates, selectedDate }: DateSidebarProps) {
  if (dates.length === 0) {
    return (
      <div className="w-[200px] shrink-0 border-r border-border flex items-start px-3 pt-6">
        <p className="text-xs text-muted-foreground">No days added yet.</p>
      </div>
    )
  }

  return (
    <div className="w-[200px] shrink-0 border-r border-border overflow-y-auto">
      <div className="py-2">
        {dates.map((d) => {
          const { weekday, dayMonth } = formatSidebarDate(d.date)
          const isSelected = d.date === selectedDate

          return (
            <Link
              key={d.id}
              href={`/tours/${tourId}/schedule?date=${d.date}`}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 transition-colors',
                isSelected
                  ? 'bg-background'
                  : 'hover:bg-sidebar-accent/40',
              )}
            >
              {/* Pip */}
              <span className={cn('h-2 w-2 rounded-full shrink-0', pipClass(d.day_type))} />

              {/* Date */}
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-0.5">
                  {weekday}
                </p>
                <p className={cn('text-xs font-medium leading-none', isSelected && 'text-foreground')}>
                  {dayMonth}
                </p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
