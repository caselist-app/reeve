'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PanelShell } from '@/components/layout/panel-shell'
import { PanelDeleteMenu } from '@/components/schedule/panels/panel-delete-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PlacesAddressInput } from '@/components/shows/places-address-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  getRehearsalDetail,
  updateRehearsal,
  deleteRehearsal,
} from '@/lib/actions/rehearsals'
import { toDatetimeLocal, fromDatetimeLocal, resolveTimezone } from '@/lib/schedule/datetime'
import { useSidePanel } from '@/stores/side-panel-store'
import { useRehearsalLocations } from '@/stores/rehearsal-location-store'
import type { Tables } from '@/lib/types/database'

interface RehearsalPanelProps {
  rehearsalId: string
  locationName: string
  tourTimezone: string
}

type Rehearsal = Tables<'rehearsals'>

// The rehearsal panel, and the only way into a rehearsal's detail now that
// /tours/[id]/rehearsals/[rehearsalId] is gone (REE-36). Loads on open rather
// than being handed its data, same shape as VenuePanel: the day view fetches
// only id and location_name for the RehearsalBlock, and this panel fetches the
// rest on open.
export function RehearsalPanel({ rehearsalId, locationName, tourTimezone }: RehearsalPanelProps) {
  const router = useRouter()
  const { close } = useSidePanel()
  const setLocation = useRehearsalLocations((s) => s.setLocation)
  const [rehearsal, setRehearsal] = useState<Rehearsal | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Controlled so the Places widget can write the selected address back in.
  const [address, setAddress] = useState('')

  useEffect(() => {
    let cancelled = false

    getRehearsalDetail(rehearsalId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (data) {
          setRehearsal(data)
          setAddress(data.address ?? '')
        }
        // A failed read says so rather than rendering an empty form. An empty
        // form here reads as "this rehearsal has no details yet", and a TM who
        // believes that and saves has just cleared the row.
        else setFetchError(error ?? 'Could not load this rehearsal.')
      })
      .catch(() => {
        if (!cancelled) setFetchError('Could not load this rehearsal.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [rehearsalId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaved(false)
    setSaveError(null)
    setSaving(true)

    const fd = new FormData(e.currentTarget)
    const timezone = resolveTimezone(rehearsal ?? { timezone: null }, tourTimezone)
    const locationName = fd.get('location_name') as string

    const result = await updateRehearsal(rehearsalId, {
      location_name: locationName,
      address: (fd.get('address') as string) || null,
      google_maps_url: (fd.get('google_maps_url') as string) || null,
      start_at: fromDatetimeLocal(fd.get('start_at') as string, timezone),
      end_at: fromDatetimeLocal(fd.get('end_at') as string, timezone),
      notes: (fd.get('notes') as string) || null,
    })

    setSaving(false)

    if (result.error) {
      setSaveError(result.error)
      return
    }

    setSaveError(null)
    setSaved(true)
    setLocation(rehearsalId, locationName)
    router.refresh()

    // Refetch rather than reconstruct locally: an address change clears
    // venue_lat/venue_lng/timezone server-side (updateRehearsal), and the panel
    // should reflect that rather than keep stale coordinates in its own state.
    getRehearsalDetail(rehearsalId).then(({ data }) => {
      if (data) {
        setRehearsal(data)
        setAddress(data.address ?? '')
      }
    })
  }

  async function handleDelete(): Promise<string | null> {
    const result = await deleteRehearsal(rehearsalId)
    if (result.error) return result.error
    close()
    router.refresh()
    return null
  }

  const timezone = resolveTimezone(rehearsal ?? { timezone: null }, tourTimezone)

  return (
    <PanelShell
      title={rehearsal?.location_name ?? locationName}
      description="Rehearsal"
      headerAction={
        rehearsal ? (
          <PanelDeleteMenu
            triggerLabel="Rehearsal options"
            menuLabel="Delete rehearsal"
            confirmLabel="Delete rehearsal"
            pendingLabel="Deleting..."
            dialogTitle="Delete this rehearsal?"
            dialogDescription="The day reverts to travel or day off. This cannot be undone."
            onConfirm={handleDelete}
          />
        ) : undefined
      }
    >
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

      {rehearsal && (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="rehearsal-location_name">Location</Label>
            <Input
              id="rehearsal-location_name"
              name="location_name"
              defaultValue={rehearsal.location_name}
              placeholder="Metropolis Studios, London"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rehearsal-address">Address</Label>
            <PlacesAddressInput
              id="rehearsal-address"
              name="address"
              value={address}
              onChange={setAddress}
              placeholder="70 Chiswick High Rd, London W4 1SY"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rehearsal-google_maps_url">Google Maps link</Label>
            <Input
              id="rehearsal-google_maps_url"
              name="google_maps_url"
              type="url"
              defaultValue={rehearsal.google_maps_url ?? ''}
              placeholder="https://maps.google.com/..."
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rehearsal-start_at">Start</Label>
              <Input
                id="rehearsal-start_at"
                name="start_at"
                type="datetime-local"
                defaultValue={toDatetimeLocal(rehearsal.start_at, timezone)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rehearsal-end_at">End</Label>
              <Input
                id="rehearsal-end_at"
                name="end_at"
                type="datetime-local"
                defaultValue={toDatetimeLocal(rehearsal.end_at, timezone)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rehearsal-notes">Notes</Label>
            <Textarea
              id="rehearsal-notes"
              name="notes"
              defaultValue={rehearsal.notes ?? ''}
              rows={3}
              placeholder="Full band, focus on new material from second half of set"
            />
          </div>

          {saveError && <p className="text-sm text-destructive">{saveError}</p>}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Saving...' : 'Save'}
          </Button>

          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
        </form>
      )}
    </PanelShell>
  )
}
