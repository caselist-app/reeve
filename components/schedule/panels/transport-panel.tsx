'use client'

import { useTransition, useState } from 'react'
import { EditPanel } from '@/components/schedule/edit-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateTransportSegment } from '@/lib/actions/transport'
import type { Tables } from '@/lib/types/database'

type Segment = Pick<
  Tables<'transport_segments'>,
  | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
  | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
>

interface TransportPanelProps {
  segment: Segment
  timezone: string
}

const MODE_LABELS: Record<string, string> = {
  flight: 'Flight',
  rail:   'Train',
  bus:    'Coach',
  truck:  'Truck',
  ground: 'Ground',
  hire:   'Hire car',
}

// Converts a UTC ISO string to a datetime-local input value (YYYY-MM-DDTHH:MM)
// in the given timezone.
function toDatetimeLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  // Use sv-SE locale for "YYYY-MM-DD HH:MM:SS" format, take first 16 chars.
  return d.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16)
}

// Converts a datetime-local string back to UTC ISO.
function fromDatetimeLocal(local: string | null, tz: string): string | null {
  if (!local) return null
  // Construct a UTC date from the local time string and timezone offset.
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

export function TransportPanel({ segment, timezone }: TransportPanelProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    const departLocal = fd.get('depart_at') as string
    const arriveLocal = fd.get('arrive_at') as string

    startTransition(async () => {
      const result = await updateTransportSegment(segment.id, {
        origin:               (fd.get('origin') as string) || null,
        destination:          (fd.get('destination') as string) || null,
        depart_at:            fromDatetimeLocal(departLocal || null, timezone),
        arrive_at:            fromDatetimeLocal(arriveLocal || null, timezone),
        carrier_operator:     (fd.get('carrier_operator') as string) || null,
        vehicle_or_flight_no: (fd.get('vehicle_or_flight_no') as string) || null,
        booking_reference:    (fd.get('booking_reference') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      setError(null)
      setSaved(true)
    })
  }

  const modeLabel = MODE_LABELS[segment.mode] ?? segment.mode

  return (
    <EditPanel title={modeLabel} subtitle={[segment.origin, segment.destination].filter(Boolean).join(' to ') || undefined}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input name="origin" defaultValue={segment.origin ?? ''} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input name="destination" defaultValue={segment.destination ?? ''} className="h-7 text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Departs</Label>
            <Input
              name="depart_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(segment.depart_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Arrives</Label>
            <Input
              name="arrive_at"
              type="datetime-local"
              defaultValue={toDatetimeLocal(segment.arrive_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Carrier</Label>
            <Input name="carrier_operator" defaultValue={segment.carrier_operator ?? ''} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Flight / ref</Label>
            <Input name="vehicle_or_flight_no" defaultValue={segment.vehicle_or_flight_no ?? ''} className="h-7 text-xs" />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Booking reference</Label>
          <Input name="booking_reference" defaultValue={segment.booking_reference ?? ''} className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Input value={segment.status} readOnly className="h-7 text-xs bg-muted" />
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
