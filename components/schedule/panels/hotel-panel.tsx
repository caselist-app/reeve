'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PanelShell } from '@/components/layout/panel-shell'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { updateHotelStay, getHotelGeocodeStatus, updateRoomParty } from '@/lib/actions/hotels'
import { PartyField } from '@/components/schedule/party-field'
import type { Tables } from '@/lib/types/database'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'

// How long to keep polling for a geocode before giving up. Generous relative
// to a typical Google Maps geocode (a few seconds), short enough not to leave
// a timer running indefinitely if the job never resolves the address.
const GEOCODE_POLL_INTERVAL_MS = 4000
const GEOCODE_POLL_MAX_ATTEMPTS = 20

type Stay = Pick<
  Tables<'hotel_stays'>,
  | 'id' | 'name' | 'address'
  | 'check_in_date' | 'check_in_time'
  | 'check_out_date' | 'check_out_time'
  | 'wifi_network' | 'wifi_password'
>

interface HotelPanelProps {
  stay: Stay
  tourId: string
}

export function HotelPanel({ stay, tourId }: HotelPanelProps) {
  const router = useRouter()
  // Mirrors the check-in input so the notice can react to it. The input stays
  // uncontrolled: this only reads what the TM typed, it does not drive the field,
  // so React 19's post-action reset to defaultValue still behaves as CLAUDE.md
  // describes.
  const [checkInDate, setCheckInDate] = useState(stay.check_in_date ?? '')
  // Controlled so the Places widget can write the selected address back in.
  const [address, setAddress] = useState(stay.address ?? '')
  // Tracks the address this panel last saved, so a second save in the same
  // session is compared against what actually landed rather than the prop the
  // panel opened with.
  const lastSavedAddressRef = useRef(stay.address ?? '')
  const geocodePollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (geocodePollRef.current) clearInterval(geocodePollRef.current)
    }
  }, [])

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
    onSuccess: () => {
      // updateHotelStay nulls lat/lng and queues resolveHotelGeocodeJob
      // (Trigger.dev) whenever the address changes. That job writes the new
      // coordinates via the admin client, outside any Next.js request, so
      // nothing tells the schedule route's Router Cache to refetch when it
      // finishes. Poll until the geocode lands, then refresh so the hotel's
      // map appears on the day view without a manual reload. REE-227.
      if (address === lastSavedAddressRef.current) return
      lastSavedAddressRef.current = address

      if (geocodePollRef.current) clearInterval(geocodePollRef.current)
      let attempts = 0
      geocodePollRef.current = setInterval(() => {
        attempts += 1
        getHotelGeocodeStatus(stay.id).then(({ resolved }) => {
          if (resolved) {
            if (geocodePollRef.current) clearInterval(geocodePollRef.current)
            router.refresh()
          } else if (attempts >= GEOCODE_POLL_MAX_ATTEMPTS && geocodePollRef.current) {
            clearInterval(geocodePollRef.current)
          }
        })
      }, GEOCODE_POLL_INTERVAL_MS)
    },
  })

  return (
    <PanelShell title={stay.name ?? 'Hotel'} description={stay.address ?? undefined}>
      <div className="space-y-4">
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="hotel-name" className="text-xs">
              Hotel name
            </Label>
            <Input id="hotel-name" name="name" defaultValue={stay.name ?? ''} className="h-7 text-xs" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hotel-address" className="text-xs">
              Address
            </Label>
            <PlacesAddressInput
              id="hotel-address"
              name="address"
              value={address}
              onChange={setAddress}
              className="h-7 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="hotel-check_in_date" className="text-xs">
                Check-in date
              </Label>
              <Input
                id="hotel-check_in_date"
                name="check_in_date"
                type="date"
                defaultValue={stay.check_in_date ?? ''}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="h-7 text-xs"
              />
              {/* check_in_date is the day a stay belongs to, so changing it is what
                  moves the stay off the day the TM is looking at. */}
              <DateMoveNotice currentDate={stay.check_in_date} value={checkInDate} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hotel-check_in_time" className="text-xs">
                Check-in time
              </Label>
              <Input
                id="hotel-check_in_time"
                name="check_in_time"
                type="time"
                defaultValue={stay.check_in_time ? String(stay.check_in_time).slice(0, 5) : ''}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="hotel-check_out_date" className="text-xs">
                Check-out date
              </Label>
              <Input
                id="hotel-check_out_date"
                name="check_out_date"
                type="date"
                defaultValue={stay.check_out_date ?? ''}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hotel-check_out_time" className="text-xs">
                Check-out time
              </Label>
              <Input
                id="hotel-check_out_time"
                name="check_out_time"
                type="time"
                defaultValue={stay.check_out_time ? String(stay.check_out_time).slice(0, 5) : ''}
                className="h-7 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="hotel-wifi_network" className="text-xs">
                WiFi network
              </Label>
              <Input
                id="hotel-wifi_network"
                name="wifi_network"
                defaultValue={stay.wifi_network ?? ''}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="hotel-wifi_password" className="text-xs">
                WiFi password
              </Label>
              <Input
                id="hotel-wifi_password"
                name="wifi_password"
                defaultValue={stay.wifi_password ?? ''}
                className="h-7 text-xs"
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button type="submit" size="sm" disabled={pending} className="w-full">
            {pending ? 'Saving...' : 'Save'}
          </Button>
          {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}
        </form>

        <PartyField
          tourId={tourId}
          entity={{ kind: 'hotel_stay', ids: [stay.id] }}
          onSave={(personIds) => updateRoomParty(tourId, stay.id, personIds)}
        />
      </div>
    </PanelShell>
  )
}
