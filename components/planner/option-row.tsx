'use client'

import { useTransition } from 'react'
import { Plane, Train, Bus, Car, Footprints, Clock, ExternalLink, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { recordTransportOption } from '@/lib/actions/transport'
import type { TravelOption, TransitStep } from '@/lib/logistics/types'

interface OptionRowProps {
  option: TravelOption
  tourId: string
  showId: string
  personId: string
  timezone: string | null
  venueName: string
  onRecorded?: (segmentId: string) => void
}

const MODE_BORDER = {
  flight: 'border-l-sky-400',
  rail:   'border-l-emerald-400',
  ground: 'border-l-amber-400',
} as const

const PRIMARY_ICON = {
  flight: Plane,
  rail:   Train,
  ground: Bus,
} as const

// Map Google vehicle types to icons and colours.
function transitIcon(vehicleType: string | null) {
  switch (vehicleType) {
    case 'HIGH_SPEED_TRAIN':
    case 'INTERCITY_BUS':
    case 'LONG_DISTANCE_TRAIN':
    case 'RAIL':
      return { Icon: Train, colour: 'text-emerald-600' }
    case 'BUS':
      return { Icon: Bus, colour: 'text-amber-600' }
    case 'SUBWAY':
    case 'METRO_RAIL':
    case 'TRAM':
    case 'MONORAIL':
      return { Icon: Train, colour: 'text-sky-600' }
    default:
      return { Icon: Train, colour: 'text-muted-foreground' }
  }
}

function fmt(iso: string, tz: string | null): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`
}

function flightDuration(departAt: string, arriveAt: string): string {
  return fmtDuration(
    Math.round((new Date(arriveAt).getTime() - new Date(departAt).getTime()) / 60_000)
  )
}

// ── Transit step row ──────────────────────────────────────────────────────────

function StepRow({ step, timezone }: { step: TransitStep; timezone: string | null }) {
  // Walking — small and muted, doesn't need flight-card prominence.
  if (step.mode === 'walking') {
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
        <Footprints className="h-3.5 w-3.5 shrink-0" />
        <span>Walk to {step.to_name}</span>
        <span>·</span>
        <span>{fmtDuration(step.duration_min)}</span>
      </div>
    )
  }

  if (step.mode === 'waiting') {
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm text-muted-foreground">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span>Wait {fmtDuration(step.duration_min)} at {step.from_name}</span>
      </div>
    )
  }

  // Transit step — mirrors the flight card: icon · depart ── duration ── arrive · line name
  const { Icon, colour } = transitIcon(step.vehicle_type)
  return (
    <div className="flex items-center gap-4 py-3">
      <div className={cn('flex w-8 shrink-0 items-center justify-center', colour)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex flex-1 items-center gap-3 min-w-0">
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {step.depart_at ? fmt(step.depart_at, timezone) : '--:--'}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span className="shrink-0 text-xs tabular-nums">
            {fmtDuration(step.duration_min)}
            {step.num_stops ? ` · ${step.num_stops} stop${step.num_stops > 1 ? 's' : ''}` : ''}
          </span>
          <div className="h-px flex-1 bg-border" />
        </div>
        <span className="text-xl font-semibold tabular-nums tracking-tight">
          {step.arrive_at ? fmt(step.arrive_at, timezone) : '--:--'}
        </span>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-sm font-medium">{step.line_name}</p>
        <p className="text-xs text-muted-foreground">{step.from_name} → {step.to_name}</p>
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function OptionRow({
  option,
  tourId,
  showId,
  personId,
  timezone,
  venueName,
  onRecorded,
}: OptionRowProps) {
  const [pending, startTransition] = useTransition()
  const border = MODE_BORDER[option.mode] ?? MODE_BORDER.ground
  const Icon = PRIMARY_ICON[option.mode] ?? Bus

  function handleRecord() {
    startTransition(async () => {
      const result = await recordTransportOption(tourId, showId, personId, option)
      if (result.segmentId && onRecorded) onRecorded(result.segmentId)
    })
  }

  const gt = option.ground_transit

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm transition-opacity',
        border,
        !option.feasible && 'opacity-50'
      )}
    >
      {/* ── Leg 1: Flight / rail ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Carrier logo or mode icon */}
        <div className="flex w-8 shrink-0 items-center justify-center">
          {option.carrier_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={option.carrier_logo_url}
              alt={option.carrier}
              className="h-8 w-8 rounded object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <Icon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>

        {/* Depart → Arrive with duration */}
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <span className="text-xl font-semibold tabular-nums tracking-tight">
            {fmt(option.depart_at, timezone)}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-xs tabular-nums">
              {flightDuration(option.depart_at, option.arrive_at)}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <span className="text-xl font-semibold tabular-nums tracking-tight">
            {fmt(option.arrive_at, timezone)}
          </span>
        </div>

        {/* Carrier name + flight ref + inline actions */}
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{option.carrier}</p>
            <p className="text-xs text-muted-foreground">{option.leg_ref}</p>
          </div>
          <div className="flex items-center gap-2">
            {!option.feasible && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                Too late
              </span>
            )}
            <Button size="sm" variant="outline" onClick={handleRecord} disabled={pending}>
              {pending ? 'Recording…' : 'Record'}
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
      </div>

      {/* ── Hub transit note ─────────────────────────────────────────────── */}
      <div className="border-t border-dashed px-5 py-2 text-center text-xs text-muted-foreground">
        +{option.transit_min} min through hub
      </div>

      {/* ── Leg 2: Ground transfer ───────────────────────────────────────── */}
      <div className="border-t px-5 py-4">
        {gt ? (
          // Real transit steps from Google.
          <div>
            <div className="divide-y divide-border/50">
              {gt.steps.map((step, i) => (
                <StepRow key={i} step={step} timezone={timezone} />
              ))}
            </div>
          </div>
        ) : (
          // Fallback: car estimate when Google transit unavailable.
          <div className="flex items-center gap-3">
            <div className="flex w-8 shrink-0 justify-center">
              <Car className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-1 items-center gap-3 min-w-0">
              <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
                <div className="h-px flex-1 bg-border" />
                <span className="shrink-0 text-xs">{fmtDuration(option.ground_min)} transfer (estimated)</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            </div>
          </div>
        )}

        {/* Site arrival */}
        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{venueName}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="font-semibold tabular-nums">
              ~{fmt(option.door_to_site_at, timezone)}
            </span>
          </div>
          {gt?.maps_url && (
            <a
              href={gt.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Map
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
