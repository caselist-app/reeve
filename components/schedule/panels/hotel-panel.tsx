'use client'

import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { updateHotelStay } from '@/lib/actions/hotels'
import type { Tables } from '@/lib/types/database'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

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
  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      const data = readForm(fd, {
        name: 'string',
        address: 'string',
        check_in_date: 'string',
        check_in_time: 'string',
        check_out_date: 'string',
        check_out_time: 'string',
        wifi_network: 'string',
        wifi_password: 'string',
      })
      return updateHotelStay(stay.id, data)
    },
  })

  return (
    <PanelShell title={stay.name ?? 'Hotel'} description={stay.address ?? undefined}>
      <form onSubmit={submit} className="space-y-3">
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
    </PanelShell>
  )
}
