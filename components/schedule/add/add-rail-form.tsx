'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { createTransportSegment } from '@/lib/actions/transport'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'

interface AddRailFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  // The time the TM selected on the day, 'HH:MM' in the tour zone (REE-140).
  // Seeds the departure. Falls back to 09:00 when the line carried no time.
  initialClock?: string
  onBack: () => void
  onSuccess: () => void
}

export function AddRailForm({ tourId, tourDateId, date, timezone, initialClock, onBack, onSuccess }: AddRailFormProps) {
  // The departure decides the day, and this field defaults to the current day and
  // then lets the TM edit it, so the segment can leave the day it was added from
  // before it ever exists.
  const departDefault = `${date}T${initialClock ?? '09:00'}`
  const [departLocal, setDepartLocal] = useState(departDefault)
  // Controlled so the Places widget can write the selected station back in.
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')

  const { submit, pending, error } = useEntityForm({
    refreshOnSuccess: true,
    onSuccess,
    action: (fd) => {
      const data = readForm(fd, {
        origin: 'string',
        destination: 'string',
        depart_at: 'string',
        arrive_at: 'string',
        carrier_operator: 'string',
        booking_reference: 'string',
      })
      return createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'rail',
        origin: data.origin,
        destination: data.destination,
        depart_at: fromDatetimeLocal(data.depart_at, timezone),
        arrive_at: fromDatetimeLocal(data.arrive_at, timezone),
        carrier_operator: data.carrier_operator,
        booking_reference: data.booking_reference,
      })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From station</Label>
          <PlacesAddressInput
            name="origin"
            value={origin}
            onChange={setOrigin}
            placeholder="London St Pancras"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To station</Label>
          <PlacesAddressInput
            name="destination"
            value={destination}
            onChange={setDestination}
            placeholder="Paris Gare du Nord"
            className="h-7 text-xs"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Departs</Label>
          <Input
            name="depart_at"
            type="datetime-local"
            defaultValue={departDefault}
            onChange={(e) => setDepartLocal(e.target.value)}
            className="h-7 text-xs"
          />
          <DateMoveNotice currentDate={date} value={departLocal} />
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
