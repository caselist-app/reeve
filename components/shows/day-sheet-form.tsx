'use client'

import { useTransition, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateDaySheet } from '@/lib/actions/shows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NotifyPanel } from '@/components/broadcast/notify-panel'
import type { Tables } from '@/lib/types/database'

const SCHEDULE = [
  { key: 'venue_access', label: 'Venue access' },
  { key: 'load_in', label: 'Load in' },
  { key: 'line_check', label: 'Line check' },
  { key: 'soundcheck', label: 'Soundcheck' },
  { key: 'vip', label: 'VIP' },
  { key: 'doors', label: 'Doors' },
  { key: 'support_on', label: 'Support on' },
  { key: 'support_off', label: 'Support off' },
  { key: 'changeover', label: 'Changeover' },
  { key: 'headliner_on', label: 'Headliner on' },
  { key: 'headliner_off', label: 'Headliner off' },
  { key: 'curfew', label: 'Curfew' },
  { key: 'load_out', label: 'Load out' },
  { key: 'hotel_departure', label: 'Hotel departure' },
] as const

type ScheduleKey = (typeof SCHEDULE)[number]['key']

// Formats a stored timestamptz as HH:MM in the tour's timezone for display in
// a time input. Falls back to UTC when no timezone is set.
function toTimeInput(iso: string | null | undefined, tz: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

interface DaySheetFormProps {
  tourId: string
  showId: string
  initialData: Tables<'day_sheets'> | null
  timezone: string | null
  hubResolvedAt: string | null
}

export function DaySheetForm({
  tourId,
  showId,
  initialData,
  timezone,
  hubResolvedAt,
}: DaySheetFormProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [showNotify, setShowNotify] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    setShowNotify(false)
    const fd = new FormData(e.currentTarget)

    const data: Record<ScheduleKey, string | null> = {} as Record<ScheduleKey, string | null>
    for (const { key } of SCHEDULE) {
      data[key] = (fd.get(key) as string) || null
    }

    startTransition(async () => {
      const result = await updateDaySheet(showId, data)
      if (result.error) {
        setError(result.error)
      } else {
        setError(null)
        setSaved(true)
        setShowNotify(true)
      }
    })
  }

  return (
    <div className="space-y-6">
      {!hubResolvedAt && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Resolving venue location. Transport options will appear once complete.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        {SCHEDULE.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-2 items-center gap-4">
            <Label htmlFor={`ds-${key}`} className="text-sm">
              {label}
            </Label>
            <Input
              id={`ds-${key}`}
              name={key}
              type="time"
              defaultValue={toTimeInput(
                initialData?.[key as keyof Tables<'day_sheets'>] as string | null,
                timezone
              )}
              className={cn('font-mono')}
            />
          </div>
        ))}

        <div className="flex items-center gap-4 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save schedule'}
          </Button>
          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      {showNotify && (
        <NotifyPanel
          tourId={tourId}
          change={{ type: 'day_sheet', showId }}
          previousValue={null}
        />
      )}
    </div>
  )
}
