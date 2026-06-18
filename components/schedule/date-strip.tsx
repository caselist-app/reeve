'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

interface TourDate {
  id: string
  date: string
  day_type: string
}

interface DateStripProps {
  tourId: string
  dates: TourDate[]
  defaultDate: string
}

// Identical tint logic to DateSidebar so chips look the same across both views.
function chipClass(dayType: string): { box: string; day: string; month: string } {
  switch (dayType) {
    case 'show':
      return { box: 'bg-purple-100 dark:bg-purple-500/15', day: 'text-purple-900 dark:text-purple-200', month: 'text-purple-700 dark:text-purple-400' }
    case 'travel':
      return { box: 'bg-teal-100 dark:bg-teal-500/15', day: 'text-teal-900 dark:text-teal-200', month: 'text-teal-700 dark:text-teal-400' }
    case 'press':
      return { box: 'bg-amber-100 dark:bg-amber-500/15', day: 'text-amber-900 dark:text-amber-200', month: 'text-amber-700 dark:text-amber-500' }
    case 'rehearsal':
      return { box: 'bg-blue-100 dark:bg-blue-500/15', day: 'text-blue-900 dark:text-blue-200', month: 'text-blue-700 dark:text-blue-400' }
    default:
      return { box: 'bg-stone-100 dark:bg-stone-500/15', day: 'text-stone-700 dark:text-stone-300', month: 'text-stone-500 dark:text-stone-400' }
  }
}

function chipDate(dateStr: string): { day: string; month: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    day: String(d.getDate()),
    month: d.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase(),
  }
}

// Compact horizontal date navigation shown below the mobile top-bar in place
// of the DateSidebar. Hidden at lg+ where the sidebar takes over.
export function DateStrip({ tourId, dates, defaultDate }: DateStripProps) {
  const selectedDate = useSearchParams().get('date') ?? defaultDate
  const selectedRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedDate])

  if (dates.length === 0) return null

  return (
    <div className="lg:hidden flex shrink-0 overflow-x-auto gap-1.5 border-b border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {dates.map((d) => {
        const isSelected = d.date === selectedDate
        const chip = chipClass(d.day_type)
        const { day, month } = chipDate(d.date)

        return (
          <Link
            key={d.id}
            href={`/tours/${tourId}/schedule?date=${d.date}`}
            ref={isSelected ? selectedRef : undefined}
            className={cn(
              'flex shrink-0 flex-col items-center justify-center rounded-md px-2 py-1.5 transition-colors min-w-[2.5rem]',
              chip.box,
              isSelected && 'ring-2 ring-foreground/30',
            )}
          >
            <span className={cn('text-sm font-semibold tabular-nums leading-none', chip.day)}>{day}</span>
            <span className={cn('mt-0.5 text-[9px] font-medium uppercase tracking-wide leading-none', chip.month)}>{month}</span>
          </Link>
        )
      })}
    </div>
  )
}
