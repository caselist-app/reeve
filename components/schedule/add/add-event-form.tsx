'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { createDayEvent } from '@/lib/actions/day-events'

interface AddEventFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

function fromDatetimeLocal(local: string | null, tz: string): string | null {
  if (!local) return null
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

export function AddEventForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: AddEventFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createDayEvent({
        tour_id:   tourId,
        date,
        title:     fd.get('title') as string,
        starts_at: fromDatetimeLocal((fd.get('starts_at') as string) || null, timezone),
        ends_at:   fromDatetimeLocal((fd.get('ends_at') as string) || null, timezone),
        location:  (fd.get('location') as string) || null,
        notes:     (fd.get('notes') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Title</Label>
        <Input name="title" placeholder="After show, press call..." required className="h-7 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-3">
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
