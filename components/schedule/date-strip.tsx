'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { datePrefetch, MOBILE_PREFETCH_WINDOW } from '@/lib/schedule/prefetch'
import { dayTypeChipClass } from '@/lib/schedule/day-type-colors'
import { AddDayButton } from '@/components/schedule/add-day-button'

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
  const selectedIndex = dates.findIndex((d) => d.date === selectedDate)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedDate])

  return (
    <div className="lg:hidden flex shrink-0 items-center border-b border-border">
      <div className="flex flex-1 overflow-x-auto gap-1.5 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {dates.map((d, i) => {
          const isSelected = d.date === selectedDate
          const chip = dayTypeChipClass(d.day_type)
          const { day, month } = chipDate(d.date)

          return (
            <Link
              key={d.id}
              href={`/tours/${tourId}/schedule?date=${d.date}`}
              prefetch={datePrefetch(i, selectedIndex, MOBILE_PREFETCH_WINDOW)}
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

      {/* Add a new day. Calendar-plus (not the timeline's plain plus) so adding a
          date reads differently from adding an item to the current day. */}
      <div className="shrink-0 border-l border-border px-1.5">
        <AddDayButton
          tourId={tourId}
          icon={CalendarPlus}
          align="end"
          triggerClassName="h-10 w-10 rounded-lg"
        />
      </div>
    </div>
  )
}
