'use client'

import { useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createShow, updateShow, type ShowActionState } from '@/lib/actions/shows'
import { showSchema } from '@/lib/validators/show'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NotifyPanel } from '@/components/broadcast/notify-panel'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import type { ChangeDescriptor } from '@/lib/comms/affected'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { DateMoveNotice } from '@/components/schedule/date-move-notice'

// Fields that warrant a crew notification when changed.
// address: affects everyone, the venue has physically moved.
//
// address is the only one this form still owns. Load-in and curfew were show
// columns until Brief 36 step 3 moved them onto the day, and Brief 42 made every
// time a day_items row, so this form no longer touches either. Their change alert
// moved with them: it is constructed in the day view's item panel
// (components/schedule/panels/day-item-panel.tsx), which is where a load-in is
// edited now. That is the "constructor" REE-31 was tracking; it ships there, not
// here.
type NotifyField = 'address'

type NotifyState = {
  change: Extract<ChangeDescriptor, { type: 'show' }>
  previousValue: string | null
}

type ShowData = z.infer<typeof showSchema>

interface ShowFormProps {
  tourId: string
  showId?: string
  initialData?: Partial<ShowData>
  onSuccess?: (showId: string) => void
  // Fires on every successful save, create or update, in addition to
  // whichever branch below runs. Additive rather than a replacement for
  // onSuccess: VenuePanel needs to know a save landed so it can refetch and
  // watch for the async hub/geocode resolution (REE-227), without taking over
  // onSuccess and losing the crew-notify branch that only runs when the
  // caller has not passed one.
  onSaved?: () => void
  className?: string
}

function parseBool(val: string): boolean | null {
  if (val === 'yes') return true
  if (val === 'no') return false
  return null
}

export function ShowForm({
  tourId,
  showId,
  initialData,
  onSuccess,
  onSaved,
  className,
}: ShowFormProps) {
  const formId = useId()
  const router = useRouter()
  // Set after a successful update if a notification-worthy field changed.
  const [notify, setNotify] = useState<NotifyState | null>(null)

  // Moving a show is the biggest of the three moves: the show, the day it sits on
  // and up to twenty day-sheet timestamps all go with it. Saying so before the
  // save is cheap, and this form is where a show's date is edited.
  const [date, setDate] = useState(initialData?.date ?? '')

  const [address, setAddress] = useState(initialData?.address ?? '')
  const [venueName, setVenueName] = useState(initialData?.venue_name ?? '')
  // Captured from the Places Autocomplete selection and submitted as
  // showSchema's lat/lng (REE-213). Not seeded from initialData: the row
  // carries these as venue_lat/venue_lng, not lat/lng, and it does not need to
  // be, since the submitted value only matters when the address changes in
  // this session (see the addressChanged branch in updateShow) and is always
  // freshly captured then. Cleared whenever the address is edited by hand, so
  // a coordinate from a previous selection never rides along with a
  // hand-typed address that has moved away from it.
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | undefined>(
    undefined
  )
  const [venueType, setVenueType] = useState(initialData?.venue_type ?? '')
  // A Radix Select contributes nothing to FormData, so this is state and gets
  // merged into the payload by hand, the same way venue_type is. Falls back to
  // 'none' for display only: the column is not null with that default, so a show
  // that has never been told about catering genuinely is 'none'.
  const [cateringType, setCateringType] = useState<string>(initialData?.catering_type ?? 'none')
  const [unionStage, setUnionStage] = useState(
    initialData?.union_stage == null ? '' : initialData.union_stage ? 'yes' : 'no'
  )
  const [productionOffice, setProductionOffice] = useState(
    initialData?.production_office == null ? '' : initialData.production_office ? 'yes' : 'no'
  )
  const [showers, setShowers] = useState(
    initialData?.showers == null ? '' : initialData.showers ? 'yes' : 'no'
  )

  // The notify-diff check in onSuccess needs the exact data just submitted,
  // not just the result. action() sets this before calling the server
  // action; onSuccess() always runs after action() resolves, so it is set by
  // the time onSuccess reads it.
  let submittedData: ShowData | null = null

  const { submit, pending, error, saved } = useEntityForm<ShowActionState>({
    action: (fd) => {
      setNotify(null)
      const fields = readForm(fd, {
        date: 'requiredString',
        venue_name: 'requiredString',
        capacity: 'number',
        stage_dimensions: 'string',
        parking: 'string',
        shore_power: 'string',
        stagehands: 'number',
        dressing_rooms: 'string',
        house_pa_spec: 'string',
        house_lighting_plot: 'string',
      })
      const data: ShowData = {
        date: fields.date,
        venue_name: venueName || fields.venue_name,
        address: address || null,
        venue_type: (venueType as ShowData['venue_type']) || null,
        catering_type: cateringType as ShowData['catering_type'],
        capacity: fields.capacity,
        lat: coordinates?.lat,
        lng: coordinates?.lng,
        stage_dimensions: fields.stage_dimensions,
        parking: fields.parking,
        shore_power: fields.shore_power,
        union_stage: parseBool(unionStage),
        stagehands: fields.stagehands,
        dressing_rooms: fields.dressing_rooms,
        production_office: parseBool(productionOffice),
        showers: parseBool(showers),
        house_pa_spec: fields.house_pa_spec,
        house_lighting_plot: fields.house_lighting_plot,
      }
      submittedData = data
      return showId ? updateShow(showId, data) : createShow(tourId, data)
    },
    onSuccess: (result) => {
      onSaved?.()

      if (onSuccess && result.showId) {
        onSuccess(result.showId)
        return
      }

      if (!showId) {
        // New show and no onSuccess handler. There is no show page to land on
        // any more (Brief 36 step 6), so go to the day it was created on, which
        // is where the show now lives. Every live caller passes onSuccess, so
        // this is the fallback rather than the normal path.
        router.push(`/tours/${tourId}/schedule?date=${date}`)
        return
      }

      // Existing show was updated. Check if any notification-worthy field changed.
      const notifyField = submittedData ? detectNotifyField(submittedData, initialData) : null
      if (notifyField) {
        setNotify({
          change: { type: 'show', showId, field: notifyField },
          previousValue: formatPreviousValue(notifyField, initialData),
        })
      }
    },
  })

  return (
    <form onSubmit={submit} className={cn('space-y-5', className)}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-date`}>Date</Label>
          <Input
            id={`${formId}-date`}
            name="date"
            type="date"
            defaultValue={initialData?.date ?? ''}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          {/* Only ever shows for an existing show: initialData has no date on a
              new one, so there is no day it could be moving off. */}
          <DateMoveNotice currentDate={initialData?.date} value={date} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-venue_name`}>Venue</Label>
          <Input
            id={`${formId}-venue_name`}
            name="venue_name"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            placeholder="O2 Academy Brixton"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-address`}>Address</Label>
        <PlacesAddressInput
          id={`${formId}-address`}
          name="address"
          value={address}
          onChange={(value) => {
            setAddress(value)
            // Hand-typing invalidates whatever was captured from the last
            // Places selection. onPlaceSelect below re-sets this in the same
            // call when a selection is what triggered the change, so a real
            // pick still ends up with coordinates.
            setCoordinates(undefined)
          }}
          onPlaceSelect={(addr, name, lat, lng) => {
            setAddress(addr)
            // Only fill venue name if it is empty, don't overwrite what the TM typed.
            if (name && !venueName) setVenueName(name)
            setCoordinates(lat !== undefined && lng !== undefined ? { lat, lng } : undefined)
          }}
          placeholder="211 Stockwell Rd, London SW9 9SL"
          includeGeometry
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Venue type</Label>
          <Select
            name="venue_type"
            value={venueType}
            onValueChange={setVenueType}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="club">Club</SelectItem>
              <SelectItem value="theatre">Theatre</SelectItem>
              <SelectItem value="arena">Arena</SelectItem>
              <SelectItem value="festival">Festival</SelectItem>
              <SelectItem value="outdoor">Outdoor</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-capacity`}>Capacity</Label>
          <Input
            id={`${formId}-capacity`}
            name="capacity"
            type="number"
            min="1"
            defaultValue={initialData?.capacity ?? ''}
          />
        </div>
      </div>

      {/* Load-in and curfew used to sit here, writing shows.load_in_at and
          shows.curfew_at while the Schedule tab wrote the same times onto the
          old day-sheet row, with nothing syncing the two. Brief 36 step 3
          collapsed them together, and Brief 42 made every time a day_items row,
          so times are added and edited on the day view timeline and this form
          covers the show itself. */}

      <div className="space-y-2">
        <Label>Catering</Label>
        {/* Moved off the show panel with the rest of the show when Brief 42
            retired the day sheet. The meal windows that used to sit under this
            select are catering items on the day now, so this is the whole of
            what is left: who is providing it. */}
        <Select name="catering_type" value={cateringType} onValueChange={setCateringType}>
          <SelectTrigger>
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="buyout">Buyout</SelectItem>
            <SelectItem value="provided">Provided</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="pt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Technical
      </p>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-stage_dimensions`}>Stage dimensions</Label>
        <Input
          id={`${formId}-stage_dimensions`}
          name="stage_dimensions"
          defaultValue={initialData?.stage_dimensions ?? ''}
          placeholder="12m wide x 8m deep"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-parking`}>Parking</Label>
          <Input
            id={`${formId}-parking`}
            name="parking"
            defaultValue={initialData?.parking ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-shore_power`}>Shore power</Label>
          <Input
            id={`${formId}-shore_power`}
            name="shore_power"
            defaultValue={initialData?.shore_power ?? ''}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Union stage</Label>
          <Select value={unionStage} onValueChange={setUnionStage}>
            <SelectTrigger>
              <SelectValue placeholder="Unknown" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-stagehands`}>Stagehands</Label>
          <Input
            id={`${formId}-stagehands`}
            name="stagehands"
            type="number"
            min="0"
            defaultValue={initialData?.stagehands ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label>Production office</Label>
          <Select value={productionOffice} onValueChange={setProductionOffice}>
            <SelectTrigger>
              <SelectValue placeholder="Unknown" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-dressing_rooms`}>Dressing rooms</Label>
          <Input
            id={`${formId}-dressing_rooms`}
            name="dressing_rooms"
            defaultValue={initialData?.dressing_rooms ?? ''}
          />
        </div>
        <div className="space-y-2">
          <Label>Showers</Label>
          <Select value={showers} onValueChange={setShowers}>
            <SelectTrigger>
              <SelectValue placeholder="Unknown" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-house_pa_spec`}>House PA spec</Label>
        <Textarea
          id={`${formId}-house_pa_spec`}
          name="house_pa_spec"
          defaultValue={initialData?.house_pa_spec ?? ''}
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-house_lighting_plot`}>House lighting plot</Label>
        <Textarea
          id={`${formId}-house_lighting_plot`}
          name="house_lighting_plot"
          defaultValue={initialData?.house_lighting_plot ?? ''}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Saving...' : showId ? 'Save changes' : 'Add show'}
      </Button>

      {saved && !notify && (
        <p className="text-sm text-muted-foreground">Saved.</p>
      )}

      {saved && notify && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Saved.</p>
          <NotifyPanel
            tourId={tourId}
            change={notify.change}
            previousValue={notify.previousValue}
          />
        </div>
      )}
    </form>
  )
}

// Returns the first notification-worthy field that changed, or null.
// Only the fields the brief specifies as crew-relevant are checked.
function detectNotifyField(
  next: Partial<ShowData>,
  prev: Partial<ShowData> | undefined
): NotifyField | null {
  if (!prev) return null
  if ((next.address ?? null) !== (prev.address ?? null)) return 'address'
  return null
}

// Formats the old value of a field as a human-readable string for the
// "was X" part of the change message.
function formatPreviousValue(
  field: NotifyField,
  prev: Partial<ShowData> | undefined
): string | null {
  if (!prev) return null
  if (field === 'address') {
    return prev.address ?? null
  }
  return null
}
