'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ShowForm } from '@/components/shows/show-form'
import { createTourDate } from '@/lib/actions/tour-dates'
import { createRehearsal } from '@/lib/actions/rehearsals'

type DayType = 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'

interface Props {
  tourId: string
}

export function AddDayPanel({ tourId }: Props) {
  const { close } = useSidePanel()
  const router = useRouter()

  // Panel unmounts between opens so initial state is always fresh.
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
      close()
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
    close()
    router.refresh()
  }

  return (
    <PanelShell title="Add day">
      <div className="space-y-5">
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
              close()
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
                placeholder={
                  dayType === 'rehearsal'
                    ? 'Metropolis Studios, London'
                    : 'e.g. Paris press junket'
                }
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
    </PanelShell>
  )
}
