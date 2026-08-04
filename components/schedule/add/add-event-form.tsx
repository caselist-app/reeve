'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createDayEvent } from '@/lib/actions/day-events'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

interface AddEventFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

// tourDateId is part of the shared add-form props but unused here: day events
// key off the date, not a tour_date_id link.
export function AddEventForm({ tourId, date, timezone, onBack, onSuccess }: AddEventFormProps) {
  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess,
    action: (fd) => {
      const data = readForm(fd, {
        title: 'requiredString',
        starts_at: 'string',
        ends_at: 'string',
        location: 'string',
        notes: 'string',
      })
      return createDayEvent({
        tour_id: tourId,
        date,
        title: data.title,
        starts_at: fromDatetimeLocal(data.starts_at, timezone),
        ends_at: fromDatetimeLocal(data.ends_at, timezone),
        location: data.location,
        notes: data.notes,
      })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input name="title" placeholder="After show, press call..." required className="h-7 text-xs" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Starts</Label>
          <Input name="starts_at" type="datetime-local" defaultValue={`${date}T20:00`} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ends</Label>
          <Input name="ends_at" type="datetime-local" className="h-7 text-xs" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Location</Label>
        <Input name="location" placeholder="Optional" className="h-7 text-xs" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Notes</Label>
        <Textarea name="notes" rows={2} className="text-xs" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add event'}
        </Button>
      </div>
    </form>
  )
}
