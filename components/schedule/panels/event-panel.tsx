'use client'

import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { updateDayEvent } from '@/lib/actions/day-events'
import type { Tables } from '@/lib/types/database'
import { fromDatetimeLocal, toDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

type DayEvent = Pick<
  Tables<'day_events'>,
  'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
>

interface EventPanelProps {
  event: DayEvent
  timezone: string
}

export function EventPanel({ event, timezone }: EventPanelProps) {
  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      // title is `required` on the input below and the column is not null, so
      // it has no cleared state and reads as requiredString. The rest follow
      // the convention: blank clears, absent is left alone.
      const data = readForm(fd, {
        title: 'requiredString',
        starts_at: 'string',
        ends_at: 'string',
        location: 'string',
        notes: 'string',
      })
      return updateDayEvent(event.id, {
        title: data.title,
        starts_at: fromDatetimeLocal(data.starts_at, timezone),
        ends_at: fromDatetimeLocal(data.ends_at, timezone),
        location: data.location,
        notes: data.notes,
      })
    },
  })

  return (
    <PanelShell title={event.title} description="Event">
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input name="title" defaultValue={event.title} required className="h-7 text-xs" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Starts</Label>
            <Input
              name="starts_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(event.starts_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ends</Label>
            <Input
              name="ends_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(event.ends_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Location</Label>
          <Input name="location" defaultValue={event.location ?? ''} className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea name="notes" defaultValue={event.notes ?? ''} rows={3} className="text-xs" />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? 'Saving...' : 'Save'}
        </Button>
        {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}
      </form>
    </PanelShell>
  )
}
