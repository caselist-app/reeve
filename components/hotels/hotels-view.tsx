'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StayRow, type StayWithContext } from '@/components/hotels/stay-row'

interface ShowGroup {
  show_id: string
  venue_name: string
  show_date: string
}

interface HotelsViewProps {
  tourId: string
  stays: StayWithContext[]
  shows: ShowGroup[]
}

type Filter = 'all' | 'to-confirm' | 'confirmed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'to-confirm', label: 'To confirm' },
  { key: 'confirmed', label: 'Confirmed' },
]

function matchesFilter(stay: StayWithContext, filter: Filter): boolean {
  if (filter === 'all') return true
  const isConfirmed = !!stay.confirmation_number?.trim()
  if (filter === 'confirmed') return isConfirmed
  if (filter === 'to-confirm') return !isConfirmed
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

export function HotelsView({ tourId, stays, shows }: HotelsViewProps) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = stays.filter((s) => matchesFilter(s, filter))

  const showById = new Map(shows.map((s) => [s.show_id, s]))

  const byShow = new Map<string, StayWithContext[]>()
  const unlinked: StayWithContext[] = []

  for (const stay of filtered) {
    if (stay.show_id && showById.has(stay.show_id)) {
      const group = byShow.get(stay.show_id) ?? []
      group.push(stay)
      byShow.set(stay.show_id, group)
    } else {
      unlinked.push(stay)
    }
  }

  const showsWithStays = shows.filter((s) => (byShow.get(s.show_id)?.length ?? 0) > 0)

  if (stays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <Building2 className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium">No hotels on this tour yet.</p>
        <p className="text-sm text-muted-foreground">Add hotels via the planner on each show.</p>
        <Link
          href={`/tours/${tourId}/shows`}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Go to Shows &rarr;
        </Link>
      </div>
    )
  }

  const hasResults = showsWithStays.length > 0 || unlinked.length > 0

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
          No {filter === 'to-confirm' ? 'unconfirmed' : filter} stays on this tour.
        </p>
      )}

      {/* Show groups */}
      {showsWithStays.map((show) => {
        const groupStays = byShow.get(show.show_id) ?? []
        return (
          <div key={show.show_id} className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-semibold">{show.venue_name}</span>
              <span className="text-sm text-muted-foreground">{formatShowDate(show.show_date)}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <StayTable stays={groupStays} tourId={tourId} />
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
          <StayTable stays={unlinked} tourId={tourId} />
        </div>
      )}
    </div>
  )
}

function StayTable({ stays, tourId }: { stays: StayWithContext[]; tourId: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border/50">
      <table className="w-full text-sm">
        <tbody>
          {stays.map((stay) => (
            <StayRow key={stay.id} stay={stay} tourId={tourId} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
