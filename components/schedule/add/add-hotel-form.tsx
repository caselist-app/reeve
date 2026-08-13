'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { createHotelStay } from '@/lib/actions/hotels'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'
import { PartyPickerFields } from '@/components/schedule/party-picker'
import { createdAsForPreset, type PartyPickerPerson, type PartyPreset } from '@/lib/party/presets'

interface AddHotelFormProps {
  tourId: string
  tourDateId: string
  date: string
  // The time the TM selected on the day, 'HH:MM' in the tour zone (REE-140).
  // Seeds the check-in time. Falls back to 15:00 when the line carried no time.
  initialClock?: string
  people: PartyPickerPerson[]
  onBack: () => void
  onSuccess: () => void
}

type PendingHotel = {
  name: string | null | undefined
  address: string | null | undefined
  check_in_date: string | null | undefined
  check_in_time: string | null | undefined
  check_out_date: string | null | undefined
  check_out_time: string | null | undefined
}

export function AddHotelForm({ tourId, tourDateId, date, initialClock, people, onBack, onSuccess }: AddHotelFormProps) {
  const router = useRouter()
  // The add flow is the worse half of the problem the notice and the toast exist
  // for: this panel closes on success, so a stay created for another date leaves
  // no trace on the timeline in front of the TM at all.
  const [checkInDate, setCheckInDate] = useState(date)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  // REE-169: fields, then party, one createHotelStay call from the party
  // step. Same shape as AddDriveForm/AddRailForm.
  const [pending, setPending] = useState<PendingHotel | null>(null)
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleFieldsSubmit(fd: FormData) {
    const data = readForm(fd, {
      name: 'string',
      address: 'string',
      check_in_date: 'string',
      check_in_time: 'string',
      check_out_date: 'string',
      check_out_time: 'string',
    })
    setPending(data)
  }

  function handlePartySave(preset: PartyPreset, resolved: PartyPickerPerson[]) {
    if (!pending) return
    setError(null)
    startTransition(async () => {
      const result = await createHotelStay(tourId, {
        tour_date_id: tourDateId,
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
      <div className="space-y-1">
        <Label className="text-xs">Hotel name</Label>
        <Input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ace Hotel London"
          className="h-7 text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Address</Label>
        <PlacesAddressInput
          name="address"
          value={address}
          onChange={setAddress}
          onPlaceSelect={(addr, placeName) => {
            setAddress(addr)
            // Only fill the hotel name if it is empty, don't overwrite what the TM typed.
            if (placeName && !name) setName(placeName)
          }}
          placeholder="100 Shoreditch High St"
          className="h-7 text-xs"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Check-in date</Label>
          <Input
            name="check_in_date"
            type="date"
            defaultValue={date}
            onChange={(e) => setCheckInDate(e.target.value)}
            className="h-7 text-xs"
          />
          <DateMoveNotice currentDate={date} value={checkInDate} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Check-in time</Label>
          <Input name="check_in_time" type="time" defaultValue={initialClock ?? '15:00'} className="h-7 text-xs" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Check-out date</Label>
          <Input name="check_out_date" type="date" className="h-7 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Check-out time</Label>
          <Input name="check_out_time" type="time" defaultValue="11:00" className="h-7 text-xs" />
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
