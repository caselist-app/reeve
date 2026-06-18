'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createTransportSegment } from '@/lib/actions/transport'

interface AddRailFormProps {
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

export function AddRailForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: AddRailFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await createTransportSegment(tourId, {
        tour_date_id:         tourDateId,
        mode:                 'rail',
        origin:               (fd.get('origin') as string) || null,
        destination:          (fd.get('destination') as string) || null,
        depart_at:            fromDatetimeLocal((fd.get('depart_at') as string) || null, timezone),
        arrive_at:            fromDatetimeLocal((fd.get('arrive_at') as string) || null, timezone),
        carrier_operator:     (fd.get('carrier_operator') as string) || null,
        booking_reference:    (fd.get('booking_reference') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      router.refresh()
      onSuccess()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From station</Label>
          <Input name="origin" placeholder="London St Pancras" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To station</Label>
          <Input name="destination" placeholder="Paris Gare du Nord" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Departs</Label>
          <Input name="depart_at" type="datetime-local" defaultValue={`${date}T09:00`} className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Arrives</Label>
          <Input name="arrive_at" type="datetime-local" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Operator</Label>
          <Input name="carrier_operator" placeholder="Eurostar" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Reference</Label>
          <Input name="booking_reference" placeholder="ABC123" className="h-7 text-xs" />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add train'}
        </Button>
      </div>
    </form>
  )
}
