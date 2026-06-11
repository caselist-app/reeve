'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SegmentRow, type SegmentWithContext } from '@/components/transport/segment-row'

interface TransportViewProps {
  tourId: string
  timezone: string
  segments: SegmentWithContext[]
  // If set (from ?date= query param), scroll to and highlight that date group.
  focusDate: string | null
  // Kept for backwards compatibility, no longer used for grouping.
  shows?: unknown[]
}

type Filter = 'all' | 'flights' | 'rail' | 'road'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'flights', label: 'Flights' },
  { key: 'rail', label: 'Rail' },
  { key: 'road', label: 'Road' },
]

const ROAD_MODES = new Set(['bus', 'truck', 'ground', 'hire'])

function matchesFilter(mode: string, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'flights') return mode === 'flight'
  if (filter === 'rail') return mode === 'rail'
  if (filter === 'road') return ROAD_MODES.has(mode)
  return true
}

// Returns the calendar date (YYYY-MM-DD) of an ISO timestamp in the given timezone.
function toLocalDate(iso: string | null, timezone: string): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: timezone })
}

function formatGroupDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function TransportView({ tourId, timezone, segments, focusDate }: TransportViewProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const focusRef = useRef<HTMLDivElement | null>(null)

  // Scroll to the focused date group after mount.
  useEffect(() => {
    if (focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [focusDate])

  const filtered = segments.filter((s) => matchesFilter(s.mode, filter))

  // Group segments by their departure date in the tour timezone.
  // Segments with no depart_at go into an undated group at the end.
  const byDate = new Map<string, SegmentWithContext[]>()
  const undated: SegmentWithContext[] = []

  for (const seg of filtered) {
    const date = toLocalDate(seg.depart_at, timezone)
    if (date) {
      const group = byDate.get(date) ?? []
      group.push(seg)
      byDate.set(date, group)
    } else {
      undated.push(seg)
    }
  }

  const sortedDates = Array.from(byDate.keys()).sort()

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Plane className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No transport on this tour yet.</p>
        <p className="text-sm text-muted-foreground">
          Add segments via the planner on each show.
        </p>
        <Link
          href={`/tours/${tourId}/shows`}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Go to Schedule &rarr;
        </Link>
      </div>
    )
  }

  const hasResults = sortedDates.length > 0 || undated.length > 0

  return (
    <div>
      {/* Filter strip */}
      <div className="flex items-center gap-1 mb-6">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              filter === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {!hasResults && (
        <p className="text-sm text-muted-foreground py-8 text-center">
          No {filter} segments on this tour.
        </p>
      )}

      {sortedDates.map((date) => {
        const isFocus = date === focusDate
        const groupSegments = byDate.get(date) ?? []
        return (
          <div
            key={date}
            ref={isFocus ? focusRef : undefined}
            className={cn('mb-8', isFocus && 'scroll-mt-6')}
          >
            <div className="flex items-center gap-3 mb-2">
              <span className={cn('text-sm font-semibold', isFocus && 'text-primary')}>
                {formatGroupDate(date)}
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <SegmentTable segments={groupSegments} tourId={tourId} timezone={timezone} />
          </div>
        )
      })}

      {undated.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold text-muted-foreground">No date set</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SegmentTable segments={undated} tourId={tourId} timezone={timezone} />
        </div>
      )}
    </div>
  )
}

function SegmentTable({
  segments,
  tourId,
  timezone,
}: {
  segments: SegmentWithContext[]
  tourId: string
  timezone: string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-sm">
        <tbody>
          {segments.map((seg) => (
            <SegmentRow key={seg.id} segment={seg} tourId={tourId} timezone={timezone} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
