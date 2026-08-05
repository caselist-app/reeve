'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createDayItem } from '@/lib/actions/day-items'
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

// Adds a custom item to a day. Brief 42 repointed this off day_events.
//
// TWO THINGS CHANGED AND BOTH ARE DELIBERATE.
//
// It writes a day_items row of kind 'other' rather than a day_events row. It had
// to move in the same commit the timeline repointed, or a TM would add an event,
// see it accepted, and watch it never appear, because day_events is a table
// nothing reads any more. That is the exact silent-failure shape this brief
// exists to remove, so it does not get to ship on the way to removing it.
//
// The times are HH:MM rather than datetime-local. An item's day is its
// tour_date_id and the TM is adding to a day they are already looking at, so a
// date input here would offer to move the item somewhere the action deliberately
// cannot put it. A start after midnight still lands on the following morning,
// because the action resolves the roll-over across the whole day.
//
// `date` and `timezone` are part of the shared add-form props and are unused
// here now. The conversion happens server-side, where the day's other items are,
// rather than in a component that can only see this one.
export function AddEventForm({ tourId, tourDateId, onBack, onSuccess }: AddEventFormProps) {
  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess,
    action: (fd) => {
      // title is `required` on the input below and day_items_other_needs_title
      // rejects an untitled custom item, so it reads as requiredString. The rest
      // follow the convention: blank clears, absent is left alone.
      const data = readForm(fd, {
        title: 'requiredString',
        start_clock: 'string',
        end_clock: 'string',
        location: 'string',
        notes: 'string',
      })
      return createDayItem({
        tour_id: tourId,
        tour_date_id: tourDateId,
        kind: 'other',
        title: data.title,
        start_clock: data.start_clock,
        end_clock: data.end_clock,
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
          <Input name="start_clock" type="time" defaultValue="20:00" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ends</Label>
          <Input name="end_clock" type="time" className="h-7 text-xs" />
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
