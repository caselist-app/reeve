'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createTransportSegment } from '@/lib/actions/transport'
import { getDriveTime } from '@/lib/actions/drive-time'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'

interface AddDriveFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

export function AddDriveForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: AddDriveFormProps) {
  const [computedArrival, setComputedArrival] = useState<string>('')
  const [computing, setComputing] = useState(false)
  const [departLocal, setDepartLocal] = useState(`${date}T09:00`)

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

  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess,
    action: async (fd) => {
      const data = readForm(fd, {
        origin: 'string',
        destination: 'string',
        depart_at: 'string',
      })
      const departUtc = fromDatetimeLocal(data.depart_at, timezone)

      // If no computed arrival yet, compute now before saving.
      let arriveUtc: string | null = null
      if (computedArrival) {
        arriveUtc = computedArrival
      } else if (data.origin && data.destination && data.depart_at) {
        const dr = await getDriveTime(data.origin, data.destination, data.depart_at, timezone)
        arriveUtc = dr.arrive_at ?? null
      }

      return createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'ground',
        origin: data.origin,
        destination: data.destination,
        depart_at: departUtc,
        arrive_at: arriveUtc,
      })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
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
          onChange={(e) => setDepartLocal(e.target.value)}
          onBlur={(e) => {
            const form = e.currentTarget.form!
            const orig = (form.elements.namedItem('origin') as HTMLInputElement).value
            const dest = (form.elements.namedItem('destination') as HTMLInputElement).value
            computeArrival(orig, dest, e.currentTarget.value)
          }}
        />
        <DateMoveNotice currentDate={date} value={departLocal} />
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
