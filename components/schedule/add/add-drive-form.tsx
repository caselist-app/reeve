'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { createTransportSegment } from '@/lib/actions/transport'
import { getDriveTime } from '@/lib/actions/drive-time'
import { fromDatetimeLocal } from '@/lib/schedule/datetime'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'
import { PartyPickerFields } from '@/components/schedule/party-picker'
import { createdAsForPreset, type PartyPickerPerson, type PartyPreset } from '@/lib/party/presets'

interface AddDriveFormProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  // The time the TM selected on the day, 'HH:MM' in the tour zone (REE-140).
  // Seeds the departure so a drive added after clicking 2pm departs at 2pm.
  // Falls back to 09:00 when the line carried no time.
  initialClock?: string
  people: PartyPickerPerson[]
  onBack: () => void
  onSuccess: () => void
}

type PendingDrive = {
  origin: string | null | undefined
  destination: string | null | undefined
  depart_at: string | null | undefined
  arrive_at: string | null
}

export function AddDriveForm({ tourId, tourDateId, date, timezone, initialClock, people, onBack, onSuccess }: AddDriveFormProps) {
  const router = useRouter()
  const departDefault = `${date}T${initialClock ?? '09:00'}`
  const [computedArrival, setComputedArrival] = useState<string>('')
  const [computing, setComputing] = useState(false)
  const [driveTimeError, setDriveTimeError] = useState<string | null>(null)
  const [departLocal, setDepartLocal] = useState(departDefault)
  // Controlled so the Places widget can write the selected place back in. The
  // rendered inputs still carry name/value, so the onBlur handlers below can keep
  // reading the sibling fields off the form.
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')

  // REE-169: fields, then party. The segment does not exist until the TM
  // picks who it applies to, so createTransportSegment fires once, from the
  // party step, carrying both at once.
  const [pending, setPending] = useState<PendingDrive | null>(null)
  const [saving, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function computeArrival(origin: string, destination: string, departAt: string) {
    if (!origin || !destination || !departAt) return
    setComputing(true)
    setDriveTimeError(null)
    try {
      const result = await getDriveTime(origin, destination, departAt, timezone)
      if (result.arrive_at) {
        setComputedArrival(result.arrive_at)
      } else {
        setDriveTimeError('Could not calculate arrival from Google Maps. You can enter it manually after saving.')
      }
    } finally {
      setComputing(false)
    }
  }

  async function handleFieldsSubmit(fd: FormData) {
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
      if (!arriveUtc) {
        setDriveTimeError('Could not calculate arrival from Google Maps. You can enter it manually after saving.')
      }
    }

    setPending({ origin: data.origin, destination: data.destination, depart_at: departUtc, arrive_at: arriveUtc })
  }

  function handlePartySave(preset: PartyPreset, resolved: PartyPickerPerson[]) {
    if (!pending) return
    setError(null)
    startTransition(async () => {
      const result = await createTransportSegment(tourId, {
        tour_date_id: tourDateId,
        mode: 'ground',
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
          <Label className="text-xs">From</Label>
          <PlacesAddressInput
            name="origin"
            value={origin}
            onChange={setOrigin}
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
          <PlacesAddressInput
            name="destination"
            value={destination}
            onChange={setDestination}
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
          defaultValue={departDefault}
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
        {driveTimeError && <p className="text-xs text-destructive">{driveTimeError}</p>}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack} className="flex-1">Back</Button>
        <Button type="submit" size="sm" className="flex-1">Next</Button>
      </div>
    </form>
  )
}
