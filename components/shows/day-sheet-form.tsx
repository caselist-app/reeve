'use client'

import { useTransition, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateDaySheet } from '@/lib/actions/shows'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

const CATERING_TIME_FIELDS = [
  { startKey: 'catering_breakfast_start', endKey: 'catering_breakfast_end', label: 'Breakfast' },
  { startKey: 'catering_lunch_start', endKey: 'catering_lunch_end', label: 'Lunch' },
  { startKey: 'catering_dinner_start', endKey: 'catering_dinner_end', label: 'Dinner' },
] as const

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
  const [cateringType, setCateringType] = useState<'none' | 'buyout' | 'provided'>(
    (initialData?.catering_type as 'none' | 'buyout' | 'provided') ?? 'none'
  )

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
      const result = await updateDaySheet(showId, {
        ...data,
        catering_type: cateringType,
        catering_breakfast_start: cateringType === 'provided' ? (fd.get('catering_breakfast_start') as string) || null : null,
        catering_breakfast_end: cateringType === 'provided' ? (fd.get('catering_breakfast_end') as string) || null : null,
        catering_lunch_start: cateringType === 'provided' ? (fd.get('catering_lunch_start') as string) || null : null,
        catering_lunch_end: cateringType === 'provided' ? (fd.get('catering_lunch_end') as string) || null : null,
        catering_dinner_start: cateringType === 'provided' ? (fd.get('catering_dinner_start') as string) || null : null,
        catering_dinner_end: cateringType === 'provided' ? (fd.get('catering_dinner_end') as string) || null : null,
      })
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

        <div className="border-t pt-4 mt-2 space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Catering</p>

          <div className="grid grid-cols-2 items-center gap-4">
            <Label className="text-sm">Type</Label>
            <Select value={cateringType} onValueChange={(v) => setCateringType(v as typeof cateringType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="buyout">Buyout</SelectItem>
                <SelectItem value="provided">Provided</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {cateringType === 'provided' && CATERING_TIME_FIELDS.map(({ startKey, endKey, label }) => (
            <div key={startKey} className="grid grid-cols-2 items-center gap-4">
              <Label className="text-sm">{label}</Label>
              <div className="flex items-center gap-1">
                <Input
                  name={startKey}
                  type="time"
                  defaultValue={toTimeInput(initialData?.[startKey] as string | null, timezone)}
                  className={cn('font-mono')}
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  name={endKey}
                  type="time"
                  defaultValue={toTimeInput(initialData?.[endKey] as string | null, timezone)}
                  className={cn('font-mono')}
                />
              </div>
            </div>
          ))}
        </div>

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
