'use client'

import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { updateAdvanceStatus } from '@/lib/actions/shows'
import type { Tables } from '@/lib/types/database'
import type { Department, AdvanceStatus } from '@/lib/shows/advance'

const DEPARTMENTS: { key: Department; label: string }[] = [
  { key: 'audio', label: 'Audio' },
  { key: 'lighting', label: 'Lighting' },
  { key: 'staging', label: 'Staging' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'travel', label: 'Travel' },
]

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
    audio: (initialAdvance?.status_audio as AdvanceStatus) ?? 'not_started',
    lighting: (initialAdvance?.status_lighting as AdvanceStatus) ?? 'not_started',
    staging: (initialAdvance?.status_staging as AdvanceStatus) ?? 'not_started',
    hospitality: (initialAdvance?.status_hospitality as AdvanceStatus) ?? 'not_started',
    travel: (initialAdvance?.status_travel as AdvanceStatus) ?? 'not_started',
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function setStatus(dept: Department, next: AdvanceStatus) {
    const prev = statuses[dept]
    // Optimistic: reflect the change immediately before the server confirms.
    setStatuses((s) => ({ ...s, [dept]: next }))
    setError(null)

    startTransition(async () => {
      const result = await updateAdvanceStatus(showId, dept, next)
      if (result.error) {
        setStatuses((s) => ({ ...s, [dept]: prev }))
        setError(result.error)
      }
    })
  }

  return (
    <div className="space-y-1">
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {DEPARTMENTS.map(({ key, label }) => (
        <div
          key={key}
          className="flex items-center justify-between rounded-md px-2 py-2.5 hover:bg-muted/30"
        >
          <span className="text-sm font-medium">{label}</span>

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
