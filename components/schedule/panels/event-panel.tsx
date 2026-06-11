'use client'

import { useTransition, useState } from 'react'
import { EditPanel } from '@/components/schedule/edit-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { updateDayEvent } from '@/lib/actions/day-events'
import type { Tables } from '@/lib/types/database'

type DayEvent = Pick<
  Tables<'day_events'>,
  'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
>

interface EventPanelProps {
  event: DayEvent
  timezone: string
}

function toDatetimeLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16)
}

function fromDatetimeLocal(local: string | null, tz: string): string | null {
  if (!local) return null
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

export function EventPanel({ event, timezone }: EventPanelProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateDayEvent(event.id, {
        title:     (fd.get('title') as string) || undefined,
        starts_at: fromDatetimeLocal((fd.get('starts_at') as string) || null, timezone),
        ends_at:   fromDatetimeLocal((fd.get('ends_at') as string) || null, timezone),
        location:  (fd.get('location') as string) || null,
        notes:     (fd.get('notes') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      setError(null)
      setSaved(true)
    })
  }

  return (
    <EditPanel title={event.title} subtitle="Event">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Title</Label>
          <Input name="title" defaultValue={event.title} required className="h-7 text-xs" />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
    </EditPanel>
  )
}
