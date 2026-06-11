'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plane } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SegmentRow, type SegmentWithContext } from '@/components/transport/segment-row'

interface ShowGroup {
  show_id: string
  venue_name: string
  show_date: string
}

interface TransportViewProps {
  tourId: string
  timezone: string
  segments: SegmentWithContext[]
  shows: ShowGroup[]
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

function formatShowDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function TransportView({ tourId, timezone, segments, shows }: TransportViewProps) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = segments.filter((s) => matchesFilter(s.mode, filter))

  // Build a show lookup by id.
  const showById = new Map(shows.map((s) => [s.show_id, s]))

  // Partition into linked (has a matching show) and unlinked.
  const byShow = new Map<string, SegmentWithContext[]>()
  const unlinked: SegmentWithContext[] = []

  for (const seg of filtered) {
    if (seg.show_id && showById.has(seg.show_id)) {
      const group = byShow.get(seg.show_id) ?? []
      group.push(seg)
      byShow.set(seg.show_id, group)
    } else {
      unlinked.push(seg)
    }
  }

  // Shows ordered by date, filtered to only those with segments after the active filter.
  const showsWithSegments = shows.filter((s) => (byShow.get(s.show_id)?.length ?? 0) > 0)

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Plane className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No transport on this tour yet.</p>
        <p className="text-sm text-muted-foreground">Add segments via the planner on each show.</p>
        <Link
          href={`/tours/${tourId}/shows`}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Go to Shows &rarr;
        </Link>
      </div>
    )
  }

  const hasResults = showsWithSegments.length > 0 || unlinked.length > 0

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

      {/* Show groups */}
      {showsWithSegments.map((show) => {
        const groupSegments = byShow.get(show.show_id) ?? []
        return (
          <div key={show.show_id} className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold">{show.venue_name}</span>
              <span className="text-sm text-muted-foreground">{formatShowDate(show.show_date)}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <SegmentTable segments={groupSegments} tourId={tourId} timezone={timezone} />
          </div>
        )
      })}

      {/* Unlinked group */}
      {unlinked.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-semibold text-muted-foreground">Unlinked</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <SegmentTable segments={unlinked} tourId={tourId} timezone={timezone} />
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
