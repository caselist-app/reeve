'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateAdvanceStatus } from '@/lib/actions/shows'
import { useAdvanceStatuses } from '@/stores/advance-status-store'
import type { Tables } from '@/lib/types/database'
import type { AdvanceStatus } from '@/lib/shows/advance'
// DEPARTMENT_LABELS and Department come from lib/shows/departments directly,
// the same reason components/schedule/advance-block.tsx does: the single
// source of truth for department names, not a second hardcoded copy.
import { DEPARTMENT_LABELS, type Department } from '@/lib/shows/departments'

const DEPARTMENTS = Object.keys(DEPARTMENT_LABELS) as Department[]

const STATUSES: { value: AdvanceStatus; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

interface AdvanceTrackerProps {
  showId: string
  initialAdvance: Tables<'show_advance'> | null
}

export function AdvanceTracker({ showId, initialAdvance }: AdvanceTrackerProps) {
  const [statuses, setStatuses] = useState<Record<Department, AdvanceStatus>>({
    production: (initialAdvance?.status_production as AdvanceStatus) ?? 'not_started',
    lx: (initialAdvance?.status_lx as AdvanceStatus) ?? 'not_started',
    hospitality: (initialAdvance?.status_hospitality as AdvanceStatus) ?? 'not_started',
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const setStoredStatuses = useAdvanceStatuses((s) => s.setStatuses)

  function setStatus(dept: Department, next: AdvanceStatus) {
    const prev = statuses[dept]
    const optimistic = { ...statuses, [dept]: next }
    // Optimistic: reflect the change immediately before the server confirms.
    setStatuses(optimistic)
    setError(null)

    startTransition(async () => {
      const result = await updateAdvanceStatus(showId, dept, next)
      if (result.error) {
        setStatuses((s) => ({ ...s, [dept]: prev }))
        setError(result.error)
        return
      }

      // This panel is mounted in the app layout above the schedule route, so
      // a revalidate does not reliably repaint the day-info Advance block
      // below it (REE-65 class, same as guest list's REE-131). Write the
      // confirmed statuses to the store so the block picks them up without a
      // server round trip.
      setStoredStatuses(showId, optimistic)
    })
  }

  return (
    <div className="space-y-1">
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {DEPARTMENTS.map((key) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-muted/30"
        >
          <span className="text-sm font-medium">{DEPARTMENT_LABELS[key]}</span>

          <div className="inline-flex divide-x overflow-hidden rounded-md border">
            {STATUSES.map(({ value, label: sLabel }) => {
              const isActive = statuses[key] === value
              return (
                <button
                  key={value}
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(key, value)}
                  className={cn(
                    'px-3 py-1.5 text-xs transition-colors disabled:opacity-50',
                    isActive && value === 'not_started' &&
                      'bg-muted font-medium text-foreground',
                    isActive && value === 'in_progress' &&
                      'bg-amber-100 font-medium text-amber-800',
                    isActive && value === 'done' &&
                      'bg-green-100 font-medium text-green-800',
                    !isActive && 'text-muted-foreground hover:bg-muted/50'
                  )}
                >
                  {sLabel}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
