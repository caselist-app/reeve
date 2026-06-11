'use client'

import { useActionState, useState, useId, useRef, useTransition, useEffect } from 'react'
import { useTheme } from 'next-themes'
import { updateTourAction, archiveTourAction } from '@/lib/actions/tours'
import { TOUR_TIMEZONES } from '@/lib/validators/tour'
import type { Tables } from '@/lib/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const CURRENCIES = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'CHF', 'DKK', 'NOK', 'SEK', 'JPY', 'NZD']

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

interface Props {
  tour: Tables<'tours'>
}

export function TourSettingsForm({ tour }: Props) {
  const formId = useId()
  const attempted = useRef(false)

  const boundUpdate = updateTourAction.bind(null, tour.id)
  const [state, formAction, pending] = useActionState(boundUpdate, { error: null })

  const [artistAct, setArtistAct] = useState(tour.artist_act)
  const [slug, setSlug] = useState(tour.artist_slug ?? '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [currency, setCurrency] = useState(tour.base_currency)
  const [timezone, setTimezone] = useState(tour.timezone ?? '')

  const [archivePending, startArchive] = useTransition()
  const [archiveError, setArchiveError] = useState<string | null>(null)

  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Derived: true only after a successful save (not on initial render).
  const saved = attempted.current && !pending && !state.error

  async function handleArchive() {
    startArchive(async () => {
      const result = await archiveTourAction(tour.id)
      if (result.error) setArchiveError(result.error)
      // On success archiveTourAction redirects, so this line is unreachable.
    })
  }

  return (
    <div className="space-y-8">
      <form
        action={(data) => {
          attempted.current = true
          formAction(data)
        }}
        className="space-y-5"
      >
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Tour name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            defaultValue={tour.name}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${formId}-artist_act`}>Artist / act</Label>
          <Input
            id={`${formId}-artist_act`}
            name="artist_act"
            value={artistAct}
            onChange={(e) => {
              setArtistAct(e.target.value)
              if (!slugTouched) setSlug(toSlug(e.target.value))
            }}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
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
            <Label htmlFor={`${formId}-artist_slug`}>
              Slug
              <span className="ml-1 text-xs text-muted-foreground">for advancing@ email</span>
            </Label>
            <Input
              id={`${formId}-artist_slug`}
              name="artist_slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value)
                setSlugTouched(true)
              }}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>
            Tour timezone
            <span className="ml-1 text-xs text-muted-foreground">used for day sheet times</span>
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

        <div className="flex items-center gap-4">
          <Button type="submit" disabled={pending}>
            {pending ? 'Saving...' : 'Save changes'}
          </Button>
          {saved && <p className="text-sm text-muted-foreground">Saved.</p>}
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </div>
      </form>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-base font-medium">Appearance</h2>
        <p className="text-sm text-muted-foreground">Choose how Reeve looks on this device.</p>
        {mounted && (
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                  theme === t
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h2 className="text-base font-medium">Archive tour</h2>
        <p className="text-sm text-muted-foreground">
          The tour will be hidden from your active list. No data is deleted.
        </p>
        {archiveError && (
          <p className="text-sm text-destructive">{archiveError}</p>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={archivePending}>
              {archivePending ? 'Archiving...' : 'Archive tour'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archive this tour?</AlertDialogTitle>
              <AlertDialogDescription>
                The tour will be hidden from your active list. No data is deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArchive}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Archive
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
