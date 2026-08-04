'use client'

// Manual fallback for the Add Flight wizard: "Find by route" turned up
// nothing, or the TM just wants to type everything by hand. Same shape as
// the flat form add-flight-form.tsx replaced - no AirLabs involved. Split
// into its own file per Brief 32 Phase 2, since it is a genuine standalone
// form (unlike the rest of the wizard, which is one multi-step component
// with shared state across steps) and migrates cleanly to useEntityForm.

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { createTransportSegment } from '@/lib/actions/transport'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'

interface ManualFlightFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  onBack: () => void
  onSuccess: () => void
}

export function ManualFlightForm({ tourId, tourDateId, date, timezone, onBack, onSuccess }: ManualFlightFormProps) {
  const [departLocal, setDepartLocal] = useState(`${date}T07:00`)

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
        vehicle_or_flight_no: 'string',
        booking_reference: 'string',
      })
      return createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'flight',
        origin: data.origin,
        destination: data.destination,
        depart_at: fromDatetimeLocal(data.depart_at, timezone),
        arrive_at: fromDatetimeLocal(data.arrive_at, timezone),
        carrier_operator: data.carrier_operator,
        vehicle_or_flight_no: data.vehicle_or_flight_no,
        booking_reference: data.booking_reference,
      })
    },
  })

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Airline</Label>
          <Input name="carrier_operator" placeholder="BA" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Flight number</Label>
          <Input name="vehicle_or_flight_no" placeholder="BA0123" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">From</Label>
          <Input name="origin" placeholder="LHR" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">To</Label>
          <Input name="destination" placeholder="CDG" className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Departs</Label>
          <Input
            name="depart_at"
            type="datetime-local"
            defaultValue={`${date}T07:00`}
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
      <div className="space-y-1">
        <Label className="text-xs">Booking reference</Label>
        <Input name="booking_reference" placeholder="ABC123" className="h-7 text-xs" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button type="submit" size="sm" disabled={pending} className="flex-1">
          {pending ? 'Adding...' : 'Add flight'}
        </Button>
      </div>
    </form>
  )
}
