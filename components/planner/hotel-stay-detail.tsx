'use client'

import { useState, useTransition } from 'react'
import { confirmHotelBooking } from '@/lib/actions/hotels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'

type RoomAssignment = {
  id: string
  room_tier: string
  room_type: string | null
  people: { id: string; person_type: string; contacts: { name: string } | null } | null
}

interface Stay {
  id: string
  name: string | null
  address: string | null
  check_in_date: string | null
  check_out_date: string | null
  check_in_time: string | null
  check_out_time: string | null
  confirmation_number: string | null
  status: string
  wifi_network: string | null
  wifi_password: string | null
  property_contact: string | null
  parking_json: unknown
  room_assignments: RoomAssignment[]
}

interface HotelStayDetailProps {
  stay: Stay
  tourId: string
}

export function HotelStayDetail({ stay, tourId }: HotelStayDetailProps) {
  const [confirmationNumber, setConfirmationNumber] = useState(
    stay.confirmation_number ?? ''
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const isBooked = stay.status === 'booked'

  void tourId

  function handleConfirm() {
    if (!confirmationNumber.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await confirmHotelBooking(stay.id, confirmationNumber.trim())
      if (result.error) {
        setError(result.error)
      } else {
        setSaved(true)
      }
    })
  }

  const artistRooms = stay.room_assignments.filter((r) => r.room_tier === 'artist')
  const crewRooms = stay.room_assignments.filter((r) => r.room_tier === 'crew')

  return (
    <div className="space-y-6">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <StatusBadge
          label={isBooked ? 'Booked' : 'Planned'}
          variant={isBooked ? 'success' : 'warning'}
        />
      </div>

      {/* Property details */}
      <div className="space-y-1 text-sm">
        {stay.address && <p className="text-muted-foreground">{stay.address}</p>}
        {stay.property_contact && (
          <p className="text-muted-foreground">Contact: {stay.property_contact}</p>
        )}
        {stay.check_in_date && (
          <p>
            Check-in: {stay.check_in_date}
            {stay.check_in_time ? ` at ${stay.check_in_time}` : ''}
          </p>
        )}
        {stay.check_out_date && (
          <p>
            Check-out: {stay.check_out_date}
            {stay.check_out_time ? ` at ${stay.check_out_time}` : ''}
          </p>
        )}
        {stay.wifi_network && (
          <p>
            WiFi: {stay.wifi_network}
            {stay.wifi_password ? ` / ${stay.wifi_password}` : ''}
          </p>
        )}
      </div>

      <Separator />

      {/* Confirmation number */}
      <div className="space-y-2">
        <Label htmlFor="conf-number">Confirmation number</Label>
        <div className="flex gap-2">
          <Input
            id="conf-number"
            value={confirmationNumber}
            onChange={(e) => setConfirmationNumber(e.target.value)}
            placeholder="Enter after booking"
            disabled={isBooked && saved}
          />
          {!isBooked && (
            <Button
              onClick={handleConfirm}
              disabled={pending || !confirmationNumber.trim()}
            >
              {pending ? 'Saving...' : 'Confirm booking'}
            </Button>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        {saved && (
          <p className="text-xs text-green-600">Saved. Status updated to booked.</p>
        )}
      </div>

      <Separator />

      {/* Room assignments */}
      <div className="space-y-4">
        {artistRooms.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Artist rooms</h3>
            <ul className="space-y-1 text-sm">
              {artistRooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{r.people?.contacts?.name ?? 'Unknown'}</span>
                  {r.room_type && (
                    <span className="text-xs text-muted-foreground">{r.room_type}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {crewRooms.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-medium">Crew rooms</h3>
            <ul className="space-y-1 text-sm">
              {crewRooms.map((r) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span>{r.people?.contacts?.name ?? 'Unknown'}</span>
                  {r.room_type && (
                    <span className="text-xs text-muted-foreground">{r.room_type}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {artistRooms.length === 0 && crewRooms.length === 0 && (
          <p className="text-sm text-muted-foreground">No room assignments yet.</p>
        )}
      </div>
    </div>
  )
}
