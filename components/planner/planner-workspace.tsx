'use client'

import { useState, useTransition } from 'react'
import { AIRPORT_TRANSIT_MIN, RAIL_TRANSIT_MIN } from '@/lib/logistics/constants'
import { planTravel } from '@/lib/logistics/plan'
import { ContextSummary } from '@/components/planner/context-summary'
import { OptionRow } from '@/components/planner/option-row'
import { DepartureSelector } from '@/components/planner/departure-selector'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TravelOption } from '@/lib/logistics/types'

interface Person {
  id: string
  name: string
  role: string | null
  home_city: string | null
}

interface Show {
  id: string
  tour_id: string
  venue_name: string
  date: string
  load_in_at: string | null
  hub_resolved_at: string | null
  transport_hub_iata: string | null
  transport_hub_rail: string | null
  hub_ground_minutes: number | null
}

interface PriorShow {
  venue_name: string | null
  date: string
  hub: string
}

interface PlannerWorkspaceProps {
  show: Show
  people: Person[]
  tourId: string
  timezone: string | null
  priorShow: PriorShow | null
}

export function PlannerWorkspace({
  show,
  people,
  tourId,
  timezone,
  priorShow,
}: PlannerWorkspaceProps) {
  const defaultPerson = people.find((p) => p.home_city) ?? people[0]
  const [selectedPersonId, setSelectedPersonId] = useState(defaultPerson?.id ?? '')
  // null = auto-resolve (getFromHub); string = TM-selected IATA override
  const [fromOverride, setFromOverride] = useState<string | null>(null)
  const [sameDayResults, setSameDayResults] = useState<TravelOption[] | null>(null)
  const [nightBeforeResults, setNightBeforeResults] = useState<TravelOption[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const groundMin = show.hub_ground_minutes ?? (
    show.transport_hub_rail && !show.transport_hub_iata ? RAIL_TRANSIT_MIN : AIRPORT_TRANSIT_MIN
  )
  const toHub = show.transport_hub_iata ?? show.transport_hub_rail

  // Site arrival deadline is load-in. Ground and transit time is used for
  // feasibility ranking, not for shifting this display time.
  const requiredSiteArrival = show.load_in_at ?? null

  const selectedPerson = people.find((p) => p.id === selectedPersonId)

  // Reset everything whenever the person changes.
  function handlePersonChange(personId: string) {
    setSelectedPersonId(personId)
    setFromOverride(null)
    setSameDayResults(null)
    setNightBeforeResults(null)
  }

  // Display label for the "From" line. When an override is set we show the IATA.
  // Otherwise fall back to the person's home city (the auto-resolve default).
  const fromDisplay = fromOverride
    ? { label: fromOverride, iata: fromOverride }
    : { label: selectedPerson?.home_city ?? '-', iata: selectedPerson?.home_city ?? '' }

  function handleRunPlan() {
    if (!selectedPersonId) return
    setPlanError(null)
    setSameDayResults(null)
    setNightBeforeResults(null)

    startTransition(async () => {
      try {
        const options = await planTravel({
          person_id: selectedPersonId,
          show_id: show.id,
          from_override: fromOverride,
        })
        setSameDayResults(options)

        // If every same-day option is infeasible (or none exist), automatically
        // search the night before so the TM has an actionable alternative.
        const allInfeasible = options.length === 0 || options.every((o) => !o.feasible)
        if (allInfeasible) {
          const prevDate = new Date(show.date)
          prevDate.setDate(prevDate.getDate() - 1)
          const dateStr = prevDate.toISOString().slice(0, 10)
          try {
            const nightOptions = await planTravel({
              person_id: selectedPersonId,
              show_id: show.id,
              from_override: fromOverride,
              date_override: dateStr,
            })
            setNightBeforeResults(nightOptions)
          } catch {
            // Night-before search failing is non-fatal, same-day results still show.
          }
        }
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  // Hub not yet resolved, show a holding state.
  if (!show.hub_resolved_at) {
    return (
      <div className="rounded-lg border bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
        Resolving venue location... Check back in a moment.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Person
          </label>
          <Select value={selectedPersonId} onValueChange={handlePersonChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.role ? `, ${p.role}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleRunPlan} disabled={isPending || !selectedPersonId}>
          {isPending ? 'Searching...' : 'Run plan'}
        </Button>
      </div>

      {/* Context summary, "From" is an interactive departure selector */}
      <ContextSummary
        fromNode={
          <DepartureSelector
            current={fromDisplay}
            priorShow={priorShow}
            homeCity={selectedPerson?.home_city ?? null}
            onSelect={(iata) => {
              setFromOverride(iata)
              setSameDayResults(null)
              setNightBeforeResults(null)
            }}
          />
        }
        toHub={toHub}
        venueName={show.venue_name}
        requiredSiteArrival={requiredSiteArrival}
        timezone={timezone}
        groundMin={groundMin}
      />

      {/* Error */}
      {planError && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
          {planError}
        </p>
      )}

      {/* Same-day results */}
      {sameDayResults !== null && (
        <div className="space-y-3">
          {sameDayResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No options found for this route and date.
            </p>
          ) : (
            sameDayResults.map((option, i) => (
              <OptionRow
                key={`same-${option.mode}-${option.leg_ref}-${option.depart_at}-${i}`}
                option={option}
                tourId={tourId}
                showId={show.id}
                personId={selectedPersonId}
                timezone={timezone}
                venueName={show.venue_name}
                onRecorded={(segmentId) =>
                  setRecordedIds((prev) => new Set(prev).add(segmentId))
                }
              />
            ))
          )}
        </div>
      )}

      {/* Night-before results, shown when all same-day options are infeasible */}
      {nightBeforeResults !== null && (
        <div className="space-y-3">
          {/* Section header with hotel nudge */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <h3 className="text-sm font-semibold">Travel the night before</h3>
              <p className="text-xs text-muted-foreground">
                No same-day options make load-in. These get them there the evening before.
              </p>
            </div>
            <a
              href={`/tours/${tourId}/shows/${show.id}/hotels`}
              className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
            >
              Hotel needed
            </a>
          </div>

          {nightBeforeResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No options found for the evening before either.
            </p>
          ) : (
            nightBeforeResults.map((option, i) => (
              <OptionRow
                key={`night-${option.mode}-${option.leg_ref}-${option.depart_at}-${i}`}
                option={option}
                tourId={tourId}
                showId={show.id}
                personId={selectedPersonId}
                timezone={timezone}
                venueName={show.venue_name}
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
