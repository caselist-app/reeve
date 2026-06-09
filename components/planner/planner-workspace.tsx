'use client'

import { useState, useTransition } from 'react'
import { AIRPORT_TRANSIT_MIN } from '@/lib/logistics/hub-resolver'
import { planTravel } from '@/lib/logistics/plan'
import { ContextSummary } from '@/components/planner/context-summary'
import { OptionRow } from '@/components/planner/option-row'
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
  load_in_at: string | null
  hub_resolved_at: string | null
  transport_hub_iata: string | null
  transport_hub_rail: string | null
  hub_ground_minutes: number | null
}

interface PlannerWorkspaceProps {
  show: Show
  people: Person[]
  tourId: string
  timezone: string | null
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

export function PlannerWorkspace({
  show,
  people,
  tourId,
  timezone,
}: PlannerWorkspaceProps) {
  const defaultPerson = people.find((p) => p.home_city) ?? people[0]
  const [selectedPersonId, setSelectedPersonId] = useState(defaultPerson?.id ?? '')
  const [results, setResults] = useState<TravelOption[] | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [recordedIds, setRecordedIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  const groundMin = show.hub_ground_minutes ?? AIRPORT_TRANSIT_MIN
  const toHub = show.transport_hub_iata ?? show.transport_hub_rail

  const requiredSiteArrival =
    show.load_in_at
      ? addMinutes(show.load_in_at, -(groundMin + AIRPORT_TRANSIT_MIN))
      : null

  // The fromHub for the context summary is resolved server-side only when the
  // plan runs. Show a placeholder until then.
  const selectedPerson = people.find((p) => p.id === selectedPersonId)
  const fromHubDisplay = selectedPerson?.home_city ?? null

  function handleRunPlan() {
    if (!selectedPersonId) return
    setPlanError(null)
    setResults(null)

    startTransition(async () => {
      try {
        const options = await planTravel({
          person_id: selectedPersonId,
          show_id: show.id,
        })
        setResults(options)
      } catch (err) {
        setPlanError(err instanceof Error ? err.message : 'Something went wrong.')
      }
    })
  }

  // Hub not yet resolved — show a holding state.
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
          <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Select person" />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.role ? ` — ${p.role}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleRunPlan} disabled={isPending || !selectedPersonId}>
          {isPending ? 'Searching...' : 'Run plan'}
        </Button>
      </div>

      {/* Context summary */}
      <ContextSummary
        fromHub={fromHubDisplay}
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

      {/* Results */}
      {results !== null && (
        <div className="space-y-2">
          {results.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No options found for this route and date.
            </p>
          ) : (
            results.map((option, i) => (
              <OptionRow
                key={`${option.mode}-${option.leg_ref}-${option.depart_at}-${i}`}
                option={option}
                tourId={tourId}
                showId={show.id}
                personId={selectedPersonId}
                timezone={timezone}
                onRecorded={(segmentId) =>
                  setRecordedIds((prev) => new Set(prev).add(segmentId))
                }
              />
            ))
          )}
          {recordedIds.size > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              {recordedIds.size} option{recordedIds.size > 1 ? 's' : ''} recorded. Book on the carrier and paste the reference into the transport detail.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
