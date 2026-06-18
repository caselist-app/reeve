'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createTransportSegment } from '@/lib/actions/transport'
import { getDriveTime } from '@/lib/actions/drive-time'

interface AddDriveFormProps {
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

export function AddDriveForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: AddDriveFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [computedArrival, setComputedArrival] = useState<string>('')
  const [computing, setComputing] = useState(false)

  async function computeArrival(origin: string, destination: string, departAt: string) {
    if (!origin || !destination || !departAt) return
    setComputing(true)
    try {
      const result = await getDriveTime(origin, destination, departAt, timezone)
      if (result.arrive_at) setComputedArrival(result.arrive_at)
    } finally {
      setComputing(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const departLocal = fd.get('depart_at') as string
      const departUtc = fromDatetimeLocal(departLocal || null, timezone)

      // If no computed arrival yet, compute now before saving.
      let arriveUtc: string | null = null
      if (computedArrival) {
        arriveUtc = computedArrival
      } else {
        const origin = fd.get('origin') as string
        const dest = fd.get('destination') as string
        if (origin && dest && departLocal) {
          const dr = await getDriveTime(origin, dest, departLocal, timezone)
          arriveUtc = dr.arrive_at ?? null
        }
      }

      const result = await createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode:         'ground',
        origin:       (fd.get('origin') as string) || null,
        destination:  (fd.get('destination') as string) || null,
        depart_at:    departUtc,
        arrive_at:    arriveUtc,
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
          <Label className="text-xs">From</Label>
          <Input
            name="origin"
            placeholder="Paris"
            className="h-7 text-xs"
            onBlur={(e) => {
              const form = e.currentTarget.form!
              const dest = (form.elements.namedItem('destination') as HTMLInputElement).value
              const dept = (form.elements.namedItem('depart_at') as HTMLInputElement).value
              computeArrival(e.currentTarget.value, dest, dept)
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input
            name="destination"
            placeholder="Brussels"
            className="h-7 text-xs"
            onBlur={(e) => {
              const form = e.currentTarget.form!
              const orig = (form.elements.namedItem('origin') as HTMLInputElement).value
              const dept = (form.elements.namedItem('depart_at') as HTMLInputElement).value
              computeArrival(orig, e.currentTarget.value, dept)
            }}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Departure</Label>
        <Input
          name="depart_at"
          type="datetime-local"
          defaultValue={`${date}T09:00`}
          className="h-7 text-xs"
          onBlur={(e) => {
            const form = e.currentTarget.form!
            const orig = (form.elements.namedItem('origin') as HTMLInputElement).value
            const dest = (form.elements.namedItem('destination') as HTMLInputElement).value
            computeArrival(orig, dest, e.currentTarget.value)
          }}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">
          Arrival {computing && <span className="text-muted-foreground">(calculating...)</span>}
        </Label>
        <Input
          value={computedArrival}
          readOnly
          placeholder="Computed from Google Maps on save"
          className="h-7 text-xs bg-muted"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add drive'}
        </Button>
      </div>
    </form>
  )
}
