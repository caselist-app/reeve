'use client'

import { useState, useTransition } from 'react'
import {
  Plane, Train, Bus, Car, Footprints, Clock, ExternalLink, MapPin,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { resolveHomeCity } from '@/lib/actions/planner'
import { planFreeformTravel } from '@/lib/logistics/plan-freeform'
import { recordTransportOption } from '@/lib/actions/transport'
import type { TravelOption, TransitStep } from '@/lib/logistics/types'

interface Person {
  id: string
  name: string
  home_city: string | null
}

interface FreeformPlannerProps {
  tourId: string
  people: Person[]
  timezone: string | null
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

// Map Google vehicle types to icons and colours, shared with option-row.
function transitIcon(vehicleType: string | null) {
  switch (vehicleType) {
    case 'HIGH_SPEED_TRAIN':
    case 'LONG_DISTANCE_TRAIN':
    case 'RAIL':
      return { Icon: Train, colour: 'text-emerald-600' }
    case 'BUS':
    case 'INTERCITY_BUS':
      return { Icon: Bus, colour: 'text-amber-600' }
    case 'SUBWAY':
    case 'METRO_RAIL':
    case 'TRAM':
      return { Icon: Train, colour: 'text-sky-600' }
    default:
      return { Icon: Train, colour: 'text-muted-foreground' }
  }
}

// ── Transit step row (reused for first and last mile) ─────────────────────────

function StepRow({ step, timezone }: { step: TransitStep; timezone: string | null }) {
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

// ── Three-leg option card ─────────────────────────────────────────────────────

function FreeformOptionRow({
  option,
  tourId,
  personId,
  timezone,
  toName,
  onRecorded,
}: {
  option: TravelOption
  tourId: string
  personId: string | null
  timezone: string | null
  toName: string
  onRecorded?: (segmentId: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const border = MODE_BORDER[option.mode] ?? MODE_BORDER.ground
  const Icon = PRIMARY_ICON[option.mode] ?? Bus

  const duration = Math.round(
    (new Date(option.arrive_at).getTime() - new Date(option.depart_at).getTime()) / 60_000
  )

  const fm = option.first_mile_transit
  const lm = option.ground_transit

  function handleRecord() {
    if (!personId) return
    startTransition(async () => {
      const result = await recordTransportOption(tourId, '', personId, option)
      if (result.segmentId && onRecorded) onRecorded(result.segmentId)
    })
  }

  return (
    <div className={cn('overflow-hidden rounded-xl border border-l-4 bg-card shadow-sm', border)}>

      {/* ── First mile: origin city → departure hub ──────────────────────── */}
      {fm && fm.steps.length > 0 && (
        <div className="border-b px-5 py-4">
          <div className="divide-y divide-border/50">
            {fm.steps.map((step, i) => (
              <StepRow key={i} step={step} timezone={timezone} />
            ))}
          </div>
          {fm.maps_url && (
            <div className="mt-2 text-right">
              <a
                href={fm.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                Map <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Hub note (departure) ─────────────────────────────────────────── */}
      {fm && (
        <div className="border-b border-dashed px-5 py-2 text-center text-xs text-muted-foreground">
          +{option.transit_min} min through hub
        </div>
      )}

      {/* ── Main leg: flight / rail ──────────────────────────────────────── */}
      <div className="flex items-center gap-4 px-5 py-4">
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

        <div className="flex flex-1 items-center gap-3 min-w-0">
          <span className="text-xl font-semibold tabular-nums tracking-tight">
            {fmt(option.depart_at, timezone)}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span className="shrink-0 text-xs tabular-nums">{fmtDuration(duration)}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <span className="text-xl font-semibold tabular-nums tracking-tight">
            {fmt(option.arrive_at, timezone)}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{option.carrier}</p>
            <p className="text-xs text-muted-foreground">{option.leg_ref}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRecord}
              disabled={pending || !personId}
              title={!personId ? 'Select a person to record this option' : undefined}
            >
              {pending ? 'Recording…' : 'Record'}
            </Button>
            {option.book_url && (
              <a
                href={option.book_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Book <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── Hub note (arrival) ───────────────────────────────────────────── */}
      <div className="border-t border-dashed px-5 py-2 text-center text-xs text-muted-foreground">
        +{option.transit_min} min through hub
      </div>

      {/* ── Last mile: destination hub → destination place ───────────────── */}
      <div className="border-t px-5 py-4">
        {lm ? (
          <div>
            <div className="divide-y divide-border/50">
              {lm.steps.map((step, i) => (
                <StepRow key={i} step={step} timezone={timezone} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex w-8 shrink-0 justify-center">
              <Car className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex flex-1 items-center gap-2 text-muted-foreground text-xs">
              <div className="h-px flex-1 bg-border" />
              <span className="shrink-0">{fmtDuration(option.ground_min)} transfer (estimated)</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">{toName}</span>
            <span className="mx-1 text-muted-foreground">·</span>
            <span className="font-semibold tabular-nums">~{fmt(option.door_to_site_at, timezone)}</span>
          </div>
          {lm?.maps_url && (
            <a
              href={lm.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Map <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main workspace ────────────────────────────────────────────────────────────

export function FreeformPlanner({ tourId, people, timezone }: FreeformPlannerProps) {
  const [fromCity, setFromCity] = useState('')
  const [toCity, setToCity] = useState('')
  const [date, setDate] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState<string>('')
  const [results, setResults] = useState<TravelOption[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  function handlePersonChange(personId: string) {
    setSelectedPersonId(personId)
    const person = people.find((p) => p.id === personId)
    if (person?.home_city && !fromCity.trim()) {
      setFromCity(person.home_city)
    }
  }

  function handleRun() {
    const trimFrom = fromCity.trim()
    const trimTo = toCity.trim()
    if (!trimFrom || !trimTo || !date) return

    setPlanError(null)
    setResults(null)

    startTransition(async () => {
      try {
        const [fromResolved, toResolved] = await Promise.all([
          resolveHomeCity(trimFrom),
          resolveHomeCity(trimTo),
        ])

        if (!fromResolved.iata || fromResolved.lat == null || fromResolved.lng == null) {
          setPlanError(`Could not find an airport near "${trimFrom}". Try a larger nearby city.`)
          return
        }
        if (!toResolved.iata || toResolved.lat == null || toResolved.lng == null) {
          setPlanError(`Could not find an airport near "${trimTo}". Try a larger nearby city.`)
          return
        }

        const options = await planFreeformTravel({
          from_iata: fromResolved.iata,
          from_lat: fromResolved.lat,
          from_lng: fromResolved.lng,
          from_name: trimFrom,
          to_iata: toResolved.iata,
          to_lat: toResolved.lat,
          to_lng: toResolved.lng,
          to_name: trimTo,
          date,
        })
        setResults(options)
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  const selectedPerson = selectedPersonId
    ? people.find((p) => p.id === selectedPersonId) ?? null
    : null

  const canRun = fromCity.trim() && toCity.trim() && date

  return (
    <div className="space-y-6">
      {/* Inputs */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5 min-w-0 flex-1" style={{ minWidth: '160px' }}>
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <Input
            placeholder="London"
            value={fromCity}
            onChange={(e) => setFromCity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          />
        </div>
        <div className="flex flex-col gap-1.5 min-w-0 flex-1" style={{ minWidth: '160px' }}>
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <Input
            placeholder="Berlin"
            value={toCity}
            onChange={(e) => setToCity(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRun()}
          />
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
        </div>
        <Button onClick={handleRun} disabled={isPending || !canRun} className="shrink-0">
          {isPending ? 'Searching…' : 'Search'}
        </Button>
      </div>

      {/* Optional person */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Person <span className="font-normal">(optional, required to record)</span>
        </label>
        <Select value={selectedPersonId} onValueChange={handlePersonChange}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Select person" />
          </SelectTrigger>
          <SelectContent>
            {people.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPerson?.home_city && !fromCity && (
          <p className="text-xs text-muted-foreground">
            Home city: {selectedPerson.home_city}
          </p>
        )}
      </div>

      {/* Error */}
      {planError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {planError}
        </p>
      )}

      {/* Results */}
      {results !== null && (
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No options found for this route and date.
            </p>
          ) : (
            results.map((option, i) => (
              <FreeformOptionRow
                key={`${option.mode}-${option.leg_ref}-${option.depart_at}-${i}`}
                option={option}
                tourId={tourId}
                personId={selectedPersonId || null}
                timezone={timezone}
                toName={toCity.trim()}
                onRecorded={(segmentId) =>
                  setRecordedIds((prev) => new Set(prev).add(segmentId))
                }
              />
            ))
          )}
        </div>
      )}

      {recordedIds.size > 0 && (
        <p className="pt-1 text-xs text-muted-foreground">
          {recordedIds.size} option{recordedIds.size > 1 ? 's' : ''} recorded. Book on the carrier and paste the reference into the transport detail.
        </p>
      )}
    </div>
  )
}
