'use client'

import { useTransition, useState, useId } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createShow, updateShow } from '@/lib/actions/shows'
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
import type { ChangeDescriptor } from '@/lib/comms/affected'

// Fields that warrant a crew notification when changed.
// load_in_at: affects everyone traveling to the show that day.
// address: affects everyone - venue has physically moved.
// curfew_at: affects plans for the night, especially transport home.
type NotifyField = 'load_in_at' | 'address' | 'curfew_at'

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
  className?: string
}

function parseBool(val: string): boolean | null {
  if (val === 'yes') return true
  if (val === 'no') return false
  return null
}

// Formats a stored ISO timestamptz for a datetime-local input (YYYY-MM-DDTHH:MM).
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function ShowForm({ tourId, showId, initialData, onSuccess, className }: ShowFormProps) {
  const formId = useId()
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Set after a successful update if a notification-worthy field changed.
  const [notify, setNotify] = useState<NotifyState | null>(null)

  const [venueType, setVenueType] = useState(initialData?.venue_type ?? '')
  const [unionStage, setUnionStage] = useState(
    initialData?.union_stage == null ? '' : initialData.union_stage ? 'yes' : 'no'
  )
  const [productionOffice, setProductionOffice] = useState(
    initialData?.production_office == null ? '' : initialData.production_office ? 'yes' : 'no'
  )
  const [showers, setShowers] = useState(
    initialData?.showers == null ? '' : initialData.showers ? 'yes' : 'no'
  )

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    setNotify(null)
    const fd = new FormData(e.currentTarget)

    const data: ShowData = {
      date: fd.get('date') as string,
      venue_name: fd.get('venue_name') as string,
      address: (fd.get('address') as string) || null,
      venue_type: (venueType as ShowData['venue_type']) || null,
      capacity: fd.get('capacity') ? Number(fd.get('capacity')) : null,
      load_in_at: (fd.get('load_in_at') as string) || null,
      curfew_at: (fd.get('curfew_at') as string) || null,
      stage_dimensions: (fd.get('stage_dimensions') as string) || null,
      parking: (fd.get('parking') as string) || null,
      shore_power: (fd.get('shore_power') as string) || null,
      union_stage: parseBool(unionStage),
      stagehands: fd.get('stagehands') ? Number(fd.get('stagehands')) : null,
      dressing_rooms: (fd.get('dressing_rooms') as string) || null,
      production_office: parseBool(productionOffice),
      showers: parseBool(showers),
      house_pa_spec: (fd.get('house_pa_spec') as string) || null,
      house_lighting_plot: (fd.get('house_lighting_plot') as string) || null,
    }

    startTransition(async () => {
      const result = showId ? await updateShow(showId, data) : await createShow(tourId, data)

      if (result.error) {
        setError(result.error)
        return
      }

      setError(null)

      if (onSuccess && result.showId) {
        onSuccess(result.showId)
        return
      }

      if (!showId) {
        // New show: navigate to its page.
        if (result.showId) router.push(`/tours/${tourId}/shows/${result.showId}`)
        return
      }

      // Existing show was updated. Check if any notification-worthy field changed.
      setSaved(true)
      const notifyField = detectNotifyField(data, initialData)
      if (notifyField) {
        setNotify({
          change: { type: 'show', showId, field: notifyField },
          previousValue: formatPreviousValue(notifyField, initialData),
        })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-5', className)}>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-date`}>Date</Label>
          <Input
            id={`${formId}-date`}
            name="date"
            type="date"
            defaultValue={initialData?.date ?? ''}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-venue_name`}>Venue</Label>
          <Input
            id={`${formId}-venue_name`}
            name="venue_name"
            defaultValue={initialData?.venue_name ?? ''}
            placeholder="O2 Academy Brixton"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${formId}-address`}>Address</Label>
        <Input
          id={`${formId}-address`}
          name="address"
          defaultValue={initialData?.address ?? ''}
          placeholder="211 Stockwell Rd, London SW9 9SL"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-load_in_at`}>Load-in</Label>
          <Input
            id={`${formId}-load_in_at`}
            name="load_in_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(initialData?.load_in_at)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-curfew_at`}>Curfew</Label>
          <Input
            id={`${formId}-curfew_at`}
            name="curfew_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(initialData?.curfew_at)}
          />
        </div>
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

      <div className="grid grid-cols-2 gap-4">
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

      <div className="grid grid-cols-3 gap-4">
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

      <div className="grid grid-cols-2 gap-4">
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
  if ((next.load_in_at ?? null) !== (prev.load_in_at ?? null)) return 'load_in_at'
  if ((next.address ?? null) !== (prev.address ?? null)) return 'address'
  if ((next.curfew_at ?? null) !== (prev.curfew_at ?? null)) return 'curfew_at'
  return null
}

// Formats the old value of a field as a human-readable string for the
// "was X" part of the change message. Timestamps become HH:MM.
function formatPreviousValue(
  field: NotifyField,
  prev: Partial<ShowData> | undefined
): string | null {
  if (!prev) return null
  if (field === 'load_in_at' || field === 'curfew_at') {
    const iso = prev[field]
    if (!iso) return null
    // The form stores these as datetime-local strings (YYYY-MM-DDTHH:MM).
    // Slice to HH:MM for a readable "was 09:00".
    return iso.length >= 16 ? iso.slice(11, 16) : iso
  }
  if (field === 'address') {
    return prev.address ?? null
  }
  return null
}
