'use client'

import { useTransition } from 'react'
import { Plane, Train, Car, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { recordTransportOption } from '@/lib/actions/transport'
import type { TravelOption } from '@/lib/logistics/types'

interface OptionRowProps {
  option: TravelOption
  tourId: string
  showId: string
  personId: string
  timezone: string | null
  onRecorded?: (segmentId: string) => void
}

const MODE_ICON = {
  flight: Plane,
  rail: Train,
  ground: Car,
} as const

function formatTime(iso: string, tz: string | null): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

function durationLabel(departAt: string, arriveAt: string): string {
  const mins = Math.round(
    (new Date(arriveAt).getTime() - new Date(departAt).getTime()) / 60_000
  )
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function OptionRow({
  option,
  tourId,
  showId,
  personId,
  timezone,
  onRecorded,
}: OptionRowProps) {
  const [pending, startTransition] = useTransition()
  const Icon = MODE_ICON[option.mode]

  function handleRecord() {
    startTransition(async () => {
      const result = await recordTransportOption(tourId, showId, personId, option)
      if (result.segmentId && onRecorded) {
        onRecorded(result.segmentId)
      }
    })
  }

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border px-4 py-3 text-sm transition-colors',
        !option.feasible && 'opacity-50'
      )}
    >
      {/* Mode icon */}
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />

      {/* Leg summary */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium">
            {formatTime(option.depart_at, timezone)} – {formatTime(option.arrive_at, timezone)}
          </span>
          <span className="text-muted-foreground">
            {option.carrier} {option.leg_ref}
          </span>
          <span className="text-muted-foreground">
            {durationLabel(option.depart_at, option.arrive_at)}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          +{option.transit_min} min transit &nbsp;·&nbsp; +{option.ground_min} min ground &nbsp;·&nbsp;
          site ~{formatTime(option.door_to_site_at, timezone)}
        </div>
      </div>

      {/* Feasibility badge */}
      <span
        className={cn(
          'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
          option.feasible
            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        )}
      >
        {option.feasible ? 'Feasible' : 'Too late'}
      </span>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={handleRecord}
          disabled={pending}
        >
          {pending ? 'Recording...' : 'Record'}
        </Button>
        {option.book_url && (
          <a
            href={option.book_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Book
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  )
}
