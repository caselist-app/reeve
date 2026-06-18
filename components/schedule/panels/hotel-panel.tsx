'use client'

import { useTransition, useState } from 'react'
import { EditPanel } from '@/components/schedule/edit-panel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateHotelStay } from '@/lib/actions/hotels'
import type { Tables } from '@/lib/types/database'

type Stay = Pick<
  Tables<'hotel_stays'>,
  | 'id' | 'name' | 'address'
  | 'check_in_date' | 'check_in_time'
  | 'check_out_date' | 'check_out_time'
  | 'wifi_network' | 'wifi_password'
>

interface HotelPanelProps {
  stay: Stay
}

export function HotelPanel({ stay }: HotelPanelProps) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    const fd = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await updateHotelStay(stay.id, {
        name:           (fd.get('name') as string) || null,
        address:        (fd.get('address') as string) || null,
        check_in_date:  (fd.get('check_in_date') as string) || null,
        check_in_time:  (fd.get('check_in_time') as string) || null,
        check_out_date: (fd.get('check_out_date') as string) || null,
        check_out_time: (fd.get('check_out_time') as string) || null,
        wifi_network:   (fd.get('wifi_network') as string) || null,
        wifi_password:  (fd.get('wifi_password') as string) || null,
      })
      if (result.error) { setError(result.error); return }
      setError(null)
      setSaved(true)
    })
  }

  return (
    <EditPanel title={stay.name ?? 'Hotel'} subtitle={stay.address ?? undefined}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">Hotel name</Label>
          <Input name="name" defaultValue={stay.name ?? ''} className="h-7 text-xs" />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Address</Label>
          <Input name="address" defaultValue={stay.address ?? ''} className="h-7 text-xs" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Check-in date</Label>
            <Input name="check_in_date" type="date" defaultValue={stay.check_in_date ?? ''} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Check-in time</Label>
            <Input
              name="check_in_time"
              type="time"
              defaultValue={stay.check_in_time ? String(stay.check_in_time).slice(0, 5) : ''}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Check-out date</Label>
            <Input name="check_out_date" type="date" defaultValue={stay.check_out_date ?? ''} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Check-out time</Label>
            <Input
              name="check_out_time"
              type="time"
              defaultValue={stay.check_out_time ? String(stay.check_out_time).slice(0, 5) : ''}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">WiFi network</Label>
            <Input name="wifi_network" defaultValue={stay.wifi_network ?? ''} className="h-7 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">WiFi password</Label>
            <Input name="wifi_password" defaultValue={stay.wifi_password ?? ''} className="h-7 text-xs" />
          </div>
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
