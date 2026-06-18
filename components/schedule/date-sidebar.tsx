'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import { parseLocation } from '@/lib/schedule/format'
import { AddDayButton } from './add-day-button'

interface ShowRef {
  venue_name: string
  address: string | null
}

interface RehearsalRef {
  location_name: string
}

interface TransportRef {
  mode: string
  origin: string | null
  destination: string | null
  depart_at: string | null
}

interface TourDate {
  id: string
  date: string
  day_type: string
  notes: string | null
  shows: ShowRef[]
  rehearsals: RehearsalRef[]
  transport_segments: TransportRef[]
}

interface DateSidebarProps {
  tourId: string
  dates: TourDate[]
  // The day to highlight when no ?date= is present yet.
  defaultDate: string
}

const DAY_TYPE_LABELS: Record<string, string> = {
  show: 'Show',
  rehearsal: 'Rehearsal',
  travel: 'Travel',
  press: 'Press',
  day_off: 'Day off',
}

// Date chip tint per day type: light fill plus day/month text from the same
// ramp. Carries the day-type signal that the old coloured pip used to.
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

// Title and subtitle for a date row, mirroring the day-view hierarchy:
// venue/destination as the title, city or context as the subtitle.
function deriveLabel(d: TourDate): { title: string; subtitle: string } {
  const show = d.shows?.[0]
  const rehearsal = d.rehearsals?.[0]
  const segment = d.transport_segments?.[0]

  if (show) {
    return { title: show.venue_name, subtitle: parseLocation(show.address) }
  }
  if (d.day_type === 'travel' && segment) {
    const route = [segment.origin, segment.destination].filter(Boolean).join(' → ')
    return { title: 'Travel', subtitle: route }
  }
  if (rehearsal) {
    return { title: rehearsal.location_name, subtitle: 'Rehearsal' }
  }
  return { title: DAY_TYPE_LABELS[d.day_type] ?? '', subtitle: d.notes ?? '' }
}

export function DateSidebar({ tourId, dates, defaultDate }: DateSidebarProps) {
  // Read the active date from the URL client-side so the highlight updates on
  // date clicks without re-rendering the (persistent) layout.
  const selectedDate = useSearchParams().get('date') ?? defaultDate

  return (
    <div className="w-[230px] shrink-0 border-r border-border flex flex-col overflow-hidden">
      {/* Spine header: quiet label plus a secondary control to add a day. */}
      <div className="flex shrink-0 items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Dates
        </span>
        <AddDayButton tourId={tourId} />
      </div>

      {dates.length === 0 ? (
        <p className="px-3 pt-4 text-xs text-muted-foreground">No days added yet.</p>
      ) : (
        <div className="flex-1 overflow-y-auto p-2">
          {dates.map((d) => {
            const isSelected = d.date === selectedDate
            const chip = chipClass(d.day_type)
            const { day, month } = chipDate(d.date)
            const { title, subtitle } = deriveLabel(d)

            return (
              <Link
                key={d.id}
                href={`/tours/${tourId}/schedule?date=${d.date}`}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors',
                  isSelected ? 'bg-muted' : 'hover:bg-muted/50',
                )}
              >
                {/* Date chip, tinted by day type */}
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md leading-none',
                    chip.box,
                  )}
                >
                  <span className={cn('text-sm font-semibold tabular-nums leading-none', chip.day)}>
                    {day}
                  </span>
                  <span className={cn('mt-0.5 text-[9px] font-medium uppercase tracking-wide leading-none', chip.month)}>
                    {month}
                  </span>
                </div>

                {/* Title + subtitle */}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium leading-tight text-foreground">
                    {title}
                  </p>
                  {subtitle && (
                    <p className="truncate text-[11px] leading-tight text-muted-foreground">
                      {subtitle}
                    </p>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
