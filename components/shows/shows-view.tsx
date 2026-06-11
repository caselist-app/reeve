'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useSidePanel } from '@/stores/side-panel-store'
import type { Tables } from '@/lib/types/database'

export interface ShowWithAdvance extends Tables<'shows'> {
  show_advance: Tables<'show_advance'> | null
}

interface ShowsViewProps {
  tourId: string
  shows: ShowWithAdvance[]
  timezone: string | null
}

const DEPARTMENTS = ['audio', 'lighting', 'staging', 'hospitality', 'travel'] as const

function dotColor(status: string): string {
  if (status === 'done') return 'bg-green-500'
  if (status === 'in_progress') return 'bg-amber-400'
  return 'bg-muted-foreground/25'
}

// Takes "Manchester, UK" or "211 Stockwell Rd, London SW9 9SL" and returns the
// city segment: second-to-last comma-separated part when there are multiple parts.
function parseCity(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2] ?? ''
  return parts[0] ?? ''
}

function formatLoadIn(iso: string | null, tz: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

function formatDate(dateStr: string): string {
  // Append T00:00:00 so Date parses as local midnight rather than UTC midnight
  // (avoids off-by-one dates in non-UTC environments).
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function ShowsView({ tourId, shows, timezone }: ShowsViewProps) {
  const router = useRouter()
  const { open } = useSidePanel()

  const today = new Date().toISOString().slice(0, 10)
  // The first show on or after today is highlighted as the upcoming show.
  const nextShowIdx = shows.findIndex((s) => s.date >= today)

  function handleAddShow() {
    open({
      type: 'add-show',
      tourId,
      onSuccess: (showId) => router.push(`/tours/${tourId}/shows/${showId}`),
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">Shows</h2>
        <Button size="sm" onClick={handleAddShow}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add show
        </Button>
      </div>

      {shows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No shows yet. Add the first one.</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Venue</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">City</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Load-in</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Advance</th>
              </tr>
            </thead>
            <tbody>
              {shows.map((show, idx) => {
                const isNext = idx === nextShowIdx
                const advance = show.show_advance
                return (
                  <tr
                    key={show.id}
                    className="border-b last:border-0 transition-colors hover:bg-muted/30"
                  >
                    <td
                      className={cn(
                        'px-4 py-3 font-medium',
                        isNext && 'border-l-2 border-primary'
                      )}
                    >
                      {formatDate(show.date)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/tours/${tourId}/shows/${show.id}`}
                        className="font-medium hover:underline"
                      >
                        {show.venue_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {parseCity(show.address)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatLoadIn(show.load_in_at, timezone)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {DEPARTMENTS.map((dept) => {
                          const col = `status_${dept}` as keyof Tables<'show_advance'>
                          const status = advance ? String(advance[col]) : 'not_started'
                          return (
                            <span
                              key={dept}
                              title={`${dept}: ${status.replace('_', ' ')}`}
                              className={cn('h-2.5 w-2.5 rounded-full', dotColor(status))}
                            />
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
