'use client'

import { useState, useId, useRef, useEffect } from 'react'
import { updateTourAction, archiveTourAction } from '@/lib/actions/tours'
import { useEntityForm } from '@/hooks/use-entity-form'
import { useTourNameStore } from '@/stores/tour-name-store'
import { TOUR_TIMEZONES } from '@/lib/validators/tour'
import { detectBrowserTourTimezone } from '@/lib/schedule/detect-timezone'
import type { Tables } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

interface Props {
  tour: Tables<'tours'>
}

export function TourSettingsForm({ tour }: Props) {
  const formId = useId()

  // The rename has to appear in the sidebar (components/nav/tour-selector.tsx),
  // which lives in the app layout above this route. Doing that through a server
  // round-trip (revalidatePath('layout') or router.refresh()) intermittently
  // received the new data and never repainted, leaving the save stuck on
  // "Saving..." with the old name until a reload, about one in five (REE-65).
  //
  // So the round-trip is gone from the save path. On success we write the new
  // name to a client store the sidebar reads (stores/tour-name-store.ts): a
  // plain state change that cannot hang. No native <form action> reset means the
  // field keeps what the TM typed, so nothing snaps back either. The server data
  // catches up on the next navigation, when the app layout re-renders.
  const setTourName = useTourNameStore((s) => s.setName)
  const submittedName = useRef(tour.name)

  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      submittedName.current = String(fd.get('name') ?? tour.name)
      return updateTourAction(tour.id, fd)
    },
    onSuccess: () => setTourName(tour.id, submittedName.current),
  })

  const [currency, setCurrency] = useState(tour.base_currency)
  const [timezone, setTimezone] = useState(tour.timezone ?? '')
  const [inboundQa, setInboundQa] = useState(tour.inbound_qa_enabled ?? false)

  // A tour saved before the timezone was picked renders the day calendar on the
  // 'UTC' fallback, an hour or more from where the TM is (REE-119). When the tour
  // has no timezone, suggest the TM's own zone so a save fixes it; detected in an
  // effect because on the server Intl reports UTC. It only ever fills a blank
  // selection, so a real saved timezone is left exactly as the TM set it.
  useEffect(() => {
    if (tour.timezone) return
    const detected = detectBrowserTourTimezone()
    if (detected) setTimezone((current) => current || detected)
  }, [tour.timezone])
  const [morningMsg, setMorningMsg] = useState(tour.morning_message_enabled ?? false)

  const [archiveOpen, setArchiveOpen] = useState(false)

  async function handleArchive(): Promise<string | null> {
    const result = await archiveTourAction(tour.id)
    // On success archiveTourAction redirects, so the return below is unreachable.
    return result.error
  }

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Tour name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            defaultValue={tour.name}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor={`${formId}-start_date`}>Start date</Label>
            <Input
              id={`${formId}-start_date`}
              name="start_date"
              type="date"
              defaultValue={tour.start_date ?? ''}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-end_date`}>End date</Label>
            <Input
              id={`${formId}-end_date`}
              name="end_date"
              type="date"
              defaultValue={tour.end_date ?? ''}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-territory`}>Territory</Label>
          <Input
            id={`${formId}-territory`}
            name="territory"
            defaultValue={tour.territory ?? ''}
          />
        </div>

        <div className="space-y-2">
          <Label>Base currency</Label>
          <Select name="base_currency" value={currency} onValueChange={setCurrency}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>
            Tour timezone
            <span className="ml-1 text-xs text-muted-foreground">
              Used before a show or rehearsal&apos;s venue timezone is known, and for anything not
              tied to a specific one.
            </span>
          </Label>
          <Select name="timezone" value={timezone} onValueChange={setTimezone}>
            <SelectTrigger>
              <SelectValue placeholder="Select timezone" />
            </SelectTrigger>
            <SelectContent>
              {TOUR_TIMEZONES.map((tz) => (
                <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Separator />

        <div className="space-y-4">
          <h2 className="text-base font-medium">Crew comms</h2>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${formId}-morning_msg`}>Morning messages</Label>
              <p className="text-xs text-muted-foreground">
                Send a day sheet to every crew member on show days at 07:00 local time.
              </p>
            </div>
            <Switch
              id={`${formId}-morning_msg`}
              checked={morningMsg}
              onCheckedChange={setMorningMsg}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor={`${formId}-inbound_qa`}>Crew Q&A</Label>
              <p className="text-xs text-muted-foreground">
                Allow crew to ask questions via WhatsApp and receive AI-generated answers.
              </p>
            </div>
            <Switch
              id={`${formId}-inbound_qa`}
              checked={inboundQa}
              onCheckedChange={setInboundQa}
            />
          </div>

          {/* Hidden inputs carry the boolean values to the server action. */}
          <input type="hidden" name="morning_message_enabled" value={String(morningMsg)} />
          <input type="hidden" name="inbound_qa_enabled" value={String(inboundQa)} />
        </div>

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </form>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-base font-medium">Archive tour</h2>
        <p className="text-sm text-muted-foreground">
          The tour will be hidden from your active list. No data is deleted.
        </p>
        <Button variant="destructive" size="sm" onClick={() => setArchiveOpen(true)}>
          Archive tour
        </Button>
        <ConfirmDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          title="Archive this tour?"
          description="The tour will be hidden from your active list. No data is deleted."
          confirmLabel="Archive"
          pendingLabel="Archiving..."
          onConfirm={handleArchive}
        />
      </div>
    </div>
  )
}
