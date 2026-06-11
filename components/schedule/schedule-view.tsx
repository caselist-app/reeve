'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShowForm } from '@/components/shows/show-form'
import { createTourDate } from '@/lib/actions/tour-dates'
import { createRehearsal } from '@/lib/actions/rehearsals'

type DayType = 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'

interface ShowRow {
  id: string
  venue_name: string
  address: string | null
  load_in_at: string | null
}

interface RehearsalRow {
  id: string
  location_name: string
}

interface TransportRow {
  id: string
  mode: string
  origin: string | null
  destination: string | null
  depart_at: string | null
}

export interface ScheduleDateRow {
  id: string
  date: string
  day_type: DayType
  notes: string | null
  shows: ShowRow[]
  rehearsals: RehearsalRow[]
  transport_segments: TransportRow[]
}

interface ScheduleViewProps {
  tourId: string
  dates: ScheduleDateRow[]
  timezone: string | null
}

// ---- Helpers ----------------------------------------------------------------

function formatDate(dateStr: string): { weekday: string; dayMonth: string } {
  const d = new Date(`${dateStr}T00:00:00`)
  return {
    weekday: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
    dayMonth: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
  }
}

function parseCity(address: string | null): string {
  if (!address) return ''
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2] ?? ''
  return parts[0] ?? ''
}

function formatTime(iso: string | null, tz: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz ?? 'UTC',
  })
}

const DAY_TYPE_LABELS: Record<DayType, string> = {
  show: 'Show Day',
  rehearsal: 'Rehearsal',
  travel: 'Travel Day',
  press: 'Press Day',
  day_off: 'Day Off',
}

// Colour accent per day type — matches the Day Sheets app convention.
const DAY_TYPE_COLOUR: Record<DayType, string> = {
  show: 'bg-green-500',
  rehearsal: 'bg-blue-500',
  travel: 'bg-amber-400',
  press: 'bg-purple-500',
  day_off: 'bg-stone-400',
}

// ---- Sub-components ---------------------------------------------------------

function DateRow({
  row,
  tourId,
  timezone,
  isToday,
  isNext,
}: {
  row: ScheduleDateRow
  tourId: string
  timezone: string | null
  isToday: boolean
  isNext: boolean
}) {
  const { weekday, dayMonth } = formatDate(row.date)
  const show = row.shows[0] ?? null
  const rehearsal = row.rehearsals[0] ?? null
  const firstTransport = row.transport_segments[0] ?? null

  // Every day links to the unified day view.
  const href = `/tours/${tourId}/schedule/${row.date}`

  const secondary = (() => {
    if (show) {
      const city = parseCity(show.address)
      const loadIn = formatTime(show.load_in_at, timezone)
      return [show.venue_name, city, loadIn ? `Load-in ${loadIn}` : '']
        .filter(Boolean)
        .join('  ·  ')
    }
    if (rehearsal) {
      return rehearsal.location_name
    }
    if (firstTransport) {
      const parts = [firstTransport.origin, firstTransport.destination].filter(Boolean)
      return parts.join(' → ')
    }
    return row.notes ?? ''
  })()

  const content = (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg px-4 py-3 transition-colors',
        'hover:bg-muted/40 cursor-pointer',
        isNext && 'ring-1 ring-primary/30 bg-primary/5',
        isToday && 'bg-primary/10',
      )}
    >
      {/* Date column */}
      <div className="w-20 shrink-0 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {weekday}
        </p>
        <p className={cn('text-sm font-medium', isToday && 'text-primary')}>{dayMonth}</p>
      </div>

      {/* Colour bar */}
      <span className={cn('h-8 w-1 shrink-0 rounded-full', DAY_TYPE_COLOUR[row.day_type])} />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">
          {DAY_TYPE_LABELS[row.day_type]}
        </p>
        {secondary && (
          <p className="truncate text-sm font-medium">{secondary}</p>
        )}
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}

// ---- Add-day sheet ----------------------------------------------------------

function AddDaySheet({
  tourId,
  open,
  onOpenChange,
}: {
  tourId: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const router = useRouter()
  const [dayType, setDayType] = useState<DayType | ''>('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNonShowSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dayType || !date) return
    setSaving(true)
    setError(null)

    // Rehearsal: create tour_dates + rehearsals row, then navigate to day view.
    if (dayType === 'rehearsal') {
      const result = await createRehearsal(tourId, {
        date,
        location_name: notes || 'Rehearsal',
        notes: null,
      })
      setSaving(false)
      if (result.error) { setError(result.error); return }
      onOpenChange(false)
      router.push(`/tours/${tourId}/schedule/${date}`)
      return
    }

    const result = await createTourDate(tourId, {
      date,
      day_type: dayType as DayType,
      notes: notes || null,
    })
    setSaving(false)
    if (result.error) {
      setError(result.error)
      return
    }
    onOpenChange(false)
    setDayType('')
    setDate('')
    setNotes('')
    router.refresh()
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add day</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {/* Day type picker */}
          <div className="space-y-2">
            <Label>Day type</Label>
            <Select value={dayType} onValueChange={(v) => setDayType(v as DayType)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="show">Show Day</SelectItem>
                <SelectItem value="rehearsal">Rehearsal</SelectItem>
                <SelectItem value="travel">Travel Day</SelectItem>
                <SelectItem value="press">Press Day</SelectItem>
                <SelectItem value="day_off">Day Off</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Show day: use the existing ShowForm */}
          {dayType === 'show' && (
            <ShowForm
              tourId={tourId}
              onSuccess={() => {
                onOpenChange(false)
                setDayType('')
                router.refresh()
              }}
            />
          )}

          {/* All other types: date + optional notes */}
          {dayType && dayType !== 'show' && (
            <form onSubmit={handleNonShowSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="add-day-date">Date</Label>
                <Input
                  id="add-day-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-day-notes">
                  {dayType === 'rehearsal' ? 'Location' : 'Notes (optional)'}
                </Label>
                <Input
                  id="add-day-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={dayType === 'rehearsal' ? 'Metropolis Studios, London' : 'e.g. Paris press junket'}
                  required={dayType === 'rehearsal'}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={saving || !date} className="w-full">
                {saving ? 'Saving...' : 'Add day'}
              </Button>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ---- Main component ---------------------------------------------------------

export function ScheduleView({ tourId, dates, timezone }: ScheduleViewProps) {
  const [addOpen, setAddOpen] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const nextIdx = dates.findIndex((d) => d.date >= today)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-medium">Schedule</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add day
        </Button>
      </div>

      {dates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No days on this tour yet. Add the first one.
        </p>
      ) : (
        <div className="space-y-1">
          {dates.map((row, idx) => (
            <DateRow
              key={row.id}
              row={row}
              tourId={tourId}
              timezone={timezone}
              isToday={row.date === today}
              isNext={idx === nextIdx}
            />
          ))}
        </div>
      )}

      <AddDaySheet tourId={tourId} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
