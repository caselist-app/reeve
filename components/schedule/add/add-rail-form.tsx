'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { createTransportSegment } from '@/lib/actions/transport'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { broadcastDateForClock, broadcastDateOfWallClock } from '@/lib/schedule/day-window'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'
import { PartyPickerFields } from '@/components/schedule/party-picker'
import { createdAsForPreset, type PartyPickerPerson, type PartyPreset } from '@/lib/party/presets'

interface AddRailFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  // The time the TM selected on the day, 'HH:MM' in the tour zone (REE-140).
  // Seeds the departure. Falls back to 09:00 when the line carried no time.
  initialClock?: string
  people: PartyPickerPerson[]
  onBack: () => void
  onSuccess: () => void
}

type PendingRail = {
  origin: string | null | undefined
  destination: string | null | undefined
  depart_at: string | null | undefined
  arrive_at: string | null | undefined
  carrier_operator: string | null | undefined
  booking_reference: string | null | undefined
}

export function AddRailForm({ tourId, tourDateId, date, timezone, initialClock, people, onBack, onSuccess }: AddRailFormProps) {
  const router = useRouter()
  // The departure decides the day, and this field defaults to the current day and
  // then lets the TM edit it, so the segment can leave the day it was added from
  // before it ever exists. A clock before DAY_START_HOUR is the tail of tonight,
  // not the head of the viewed day, so it seeds a departure on the following
  // calendar date (REE-280).
  const departDefault = initialClock
    ? `${broadcastDateForClock(date, initialClock)}T${initialClock}`
    : `${date}T09:00`
  const [departLocal, setDepartLocal] = useState(departDefault)
  // Controlled so the Places widget can write the selected station back in.
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')

  // REE-169: fields, then party, one createTransportSegment call from the
  // party step. Same shape as AddDriveForm.
  const [pending, setPending] = useState<PendingRail | null>(null)
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleFieldsSubmit(fd: FormData) {
    const data = readForm(fd, {
      origin: 'string',
      destination: 'string',
      depart_at: 'string',
      arrive_at: 'string',
      carrier_operator: 'string',
      booking_reference: 'string',
    })
    setPending({
      origin: data.origin,
      destination: data.destination,
      depart_at: fromDatetimeLocal(data.depart_at, timezone),
      arrive_at: fromDatetimeLocal(data.arrive_at, timezone),
      carrier_operator: data.carrier_operator,
      booking_reference: data.booking_reference,
    })
  }

  function handlePartySave(preset: PartyPreset, resolved: PartyPickerPerson[]) {
    if (!pending) return
    setError(null)
    startTransition(async () => {
      const result = await createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'rail',
        ...pending,
        people: resolved.map((p) => p.id),
        created_as: createdAsForPreset(preset),
      })
      if (result.error) {
        setError(result.error)
        setPending(null)
        return
      }
      router.refresh()
      onSuccess()
    })
  }

  if (pending) {
    return (
      <div className="space-y-3">
        <PartyPickerFields people={people} onSave={handlePartySave} />
        {saving && <p className="text-xs text-muted-foreground">Adding...</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    )
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleFieldsSubmit(new FormData(e.currentTarget)) }} className="space-y-3">
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
          <DateMoveNotice currentDate={date} value={departLocal ? broadcastDateOfWallClock(departLocal) : departLocal} />
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
        <Button type="submit" size="sm" className="flex-1">Next</Button>
      </div>
    </form>
  )
}
