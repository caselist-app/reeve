'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { updateDaySheet, deleteShow } from '@/lib/actions/shows'
import type { Tables } from '@/lib/types/database'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { NotifyPanel } from '@/components/broadcast/notify-panel'
import type { ChangeDescriptor } from '@/lib/comms/affected'

type DaySheet = Pick<
  Tables<'day_sheets'>,
  | 'lobby_call' | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
  | 'doors' | 'support_on' | 'support_off' | 'changeover'
  | 'headliner_on' | 'headliner_off' | 'curfew' | 'load_out'
  | 'catering_type'
  | 'catering_breakfast_start' | 'catering_breakfast_end'
  | 'catering_lunch_start' | 'catering_lunch_end'
  | 'catering_dinner_start' | 'catering_dinner_end'
>

interface ShowPanelProps {
  showId: string
  tourId: string
  venueName: string
  timezone: string
  daySheet: DaySheet | null
}

// Day-sheet times that warrant offering to notify crew when they change.
//
// load_in: affects everyone travelling to the show that day.
// curfew: affects plans for the night, especially transport home.
//
// Brief 36 step 3 moved these two off the show row and into the day sheet, and
// the change alert had to move with them. It used to be constructed in
// show-form.tsx on the show page's Venue tab, keyed on shows.load_in_at and
// shows.curfew_at, and when those columns were dropped the alert stopped firing
// for anything but an address change. This is the surface a TM actually edits
// load-in on, so it is where the offer belongs.
//
// Ordered: the first one that changed wins, so a save that moves both offers one
// message rather than two. load_in first because it affects more people.
const NOTIFY_FIELDS = [
  { key: 'load_in' as const, field: 'load_in' as const },
  { key: 'curfew' as const, field: 'curfew' as const },
]

type NotifyState = {
  change: Extract<ChangeDescriptor, { type: 'show' }>
  previousValue: string | null
}

// Converts a UTC ISO string to a HH:MM time string in the given timezone.
function toTimeLocal(iso: string | null, tz: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

const SECTIONS = [
  {
    title: 'Arrival',
    fields: [
      // Lobby call leads the day, and used to be the last field on the form
      // under Departure, called Hotel departure. The rename is Brief 36's
      // decision 3; moving it is a consequence of Brief 40, which classes it as
      // a field that never crosses midnight and therefore stores it on the
      // show's own date. Left at the bottom under Departure it would read as
      // "after load-out", meaning the following morning, and a TM entering it
      // that way would have it stored a day early with nothing to show for it.
      // The form now says what the storage rule already assumed.
      { key: 'lobby_call' as const,   label: 'Lobby call'   },
      { key: 'venue_access' as const, label: 'Venue access' },
      { key: 'load_in' as const,      label: 'Load-in'      },
    ],
  },
  {
    title: 'Production',
    fields: [
      { key: 'line_check'  as const, label: 'Line check'  },
      { key: 'soundcheck'  as const, label: 'Soundcheck'  },
      { key: 'vip'         as const, label: 'VIP'         },
    ],
  },
  {
    title: 'Show',
    fields: [
      { key: 'doors'         as const, label: 'Doors'         },
      { key: 'support_on'    as const, label: 'Support on'    },
      { key: 'support_off'   as const, label: 'Support off'   },
      { key: 'changeover'    as const, label: 'Changeover'    },
      { key: 'headliner_on'  as const, label: 'Headliner on'  },
      { key: 'headliner_off' as const, label: 'Headliner off' },
      { key: 'curfew'        as const, label: 'Curfew'        },
    ],
  },
  {
    title: 'Departure',
    fields: [
      { key: 'load_out' as const, label: 'Load-out' },
    ],
  },
]

// Rendered only when catering_type is 'provided'. Separate from SECTIONS
// because these are the one part of the day sheet the TM can make disappear,
// and SECTIONS is assumed to be fully drawn on every render (see the readForm
// note in the submit handler).
const MEAL_WINDOWS = [
  { label: 'Breakfast', startKey: 'catering_breakfast_start' as const, endKey: 'catering_breakfast_end' as const },
  { label: 'Lunch',     startKey: 'catering_lunch_start' as const,     endKey: 'catering_lunch_end' as const },
  { label: 'Dinner',    startKey: 'catering_dinner_start' as const,    endKey: 'catering_dinner_end' as const },
]

const MEAL_FIELDS = MEAL_WINDOWS.flatMap(({ startKey, endKey }) => [startKey, endKey])

type CateringType = 'none' | 'buyout' | 'provided'

export function ShowPanel({ showId, tourId, venueName, timezone, daySheet }: ShowPanelProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const router = useRouter()
  const { close, open } = useSidePanel()

  // Set after a successful save if a notification-worthy time changed.
  const [notify, setNotify] = useState<NotifyState | null>(null)

  // Drives whether the meal windows render. A Radix Select contributes nothing
  // to FormData, so this is state and gets merged into the payload by hand,
  // the same way show-form.tsx handles venue_type.
  const [cateringType, setCateringType] = useState<CateringType>(
    (daySheet?.catering_type as CateringType) ?? 'none',
  )

  // The times as last saved, in the same HH:MM frame the inputs use, so the
  // change check compares like with like.
  //
  // Held in state rather than read from the daySheet prop on each save. The prop
  // comes from the side-panel store card, captured when the timeline item was
  // clicked, and updateDaySheet revalidates the route rather than reopening the
  // panel, so it does not update. Comparing against it would work on the first
  // save and then compare every later save against the original values, offering
  // to notify crew about a change the TM already sent.
  const [savedTimes, setSavedTimes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      NOTIFY_FIELDS.map(({ key }) => [key, toTimeLocal(daySheet?.[key] ?? null, timezone)]),
    ),
  )

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteShow(showId)
    setDeleting(false)
    if (result.error) { setDeleteError(result.error); return }
    setDeleteOpen(false)
    close()
    router.refresh()
  }

  // The notify check in onSuccess needs the values just submitted, not just the
  // result. action() sets this before calling the server action, and onSuccess
  // always runs after action() resolves, so it is populated by the time it reads.
  // Same shape as show-form.tsx's submittedData.
  // Undefined is in the value type because readForm can now report a field this
  // render did not draw. Every SECTIONS field is drawn today, so it does not
  // occur in practice; typing it out means a future conditional section cannot
  // silently read as a cleared time here.
  let submittedTimes: Record<string, string | null | undefined> | null = null

  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      setNotify(null)
      // Day sheet fields are a dynamic list (SECTIONS), not a fixed shape, so
      // the field-name-to-kind map is built from it rather than written out
      // by hand. Every field reads as plain 'string' (null when blank).
      //
      // The meal windows are in the shape unconditionally even though they are
      // only rendered when catering is 'provided'. That is the point of
      // readForm: a field this render did not draw comes back undefined and
      // updateDaySheet leaves the column alone.
      const shape: Record<string, 'string'> = Object.fromEntries(
        [
          ...SECTIONS.flatMap((section) => section.fields.map(({ key }) => key)),
          ...MEAL_FIELDS,
        ].map((key) => [key, 'string' as const]),
      )
      const data = readForm(fd, shape)
      submittedTimes = data
      return updateDaySheet(showId, {
        ...data,
        // From state, not FormData: a Radix Select posts nothing.
        catering_type: cateringType,
      } as Parameters<typeof updateDaySheet>[1])
    },
    onSuccess: () => {
      const times = submittedTimes
      if (!times) return

      const changed = NOTIFY_FIELDS.find(
        ({ key }) => (times[key] ?? '') !== (savedTimes[key] ?? ''),
      )

      if (changed) {
        setNotify({
          change: { type: 'show', showId, field: changed.field },
          // The time it was, for the "was 09:00" half of the message. Null when
          // there was nothing there before: an initial entry is not a change to
          // anything, and "was TBC" reads worse than saying nothing.
          previousValue: savedTimes[changed.key] || null,
        })
      }

      // Recorded whether or not a notify-worthy field moved, so the next save
      // compares against what is actually stored.
      setSavedTimes(
        Object.fromEntries(NOTIFY_FIELDS.map(({ key }) => [key, times[key] ?? ''])),
      )
    },
  })

  return (
    <PanelShell title={venueName} description="Day sheet">
      <form onSubmit={submit} className="space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {section.title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
              {section.fields.map(({ key, label }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <Input
                    name={key}
                    type="time"
                    defaultValue={toTimeLocal(daySheet?.[key] ?? null, timezone)}
                    className="h-7 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Catering. Lived only on the show page until Brief 36 step 6, which
            is how a schedule edit came to wipe it: this panel sent fourteen
            time fields and no catering, and the validator carried a .default()
            that invented 'none' for the fields nobody submitted. The default is
            gone (Brief 37) and the fields are here, so the panel that says
            "day sheet" now is one. */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Catering
          </p>
          <div className="space-y-2">
            <Select value={cateringType} onValueChange={(v) => setCateringType(v as CateringType)}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="buyout">Buyout</SelectItem>
                <SelectItem value="provided">Provided</SelectItem>
              </SelectContent>
            </Select>

            {/* Hidden unless catering is provided, and deliberately NOT cleared
                when it is hidden. The show page's form nulled all six columns
                on any save where catering was not 'provided', so a TM who
                flipped to buyout and back lost the windows they had entered.
                Not rendering them means readForm reports undefined and the
                action skips them, so they survive the round trip. */}
            {cateringType === 'provided' && (
              <div className="space-y-2 pt-1">
                {MEAL_WINDOWS.map(({ label, startKey, endKey }) => (
                  <div key={label} className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">{label} from</Label>
                      <Input
                        name={startKey}
                        type="time"
                        defaultValue={toTimeLocal(daySheet?.[startKey] ?? null, timezone)}
                        className="h-7 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{label} to</Label>
                      <Input
                        name={endKey}
                        type="time"
                        defaultValue={toTimeLocal(daySheet?.[endKey] ?? null, timezone)}
                        className="h-7 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {(error || deleteError) && <p className="text-xs text-destructive">{error || deleteError}</p>}
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? 'Saving...' : 'Save'}
        </Button>
        {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}

        {/* Rendered inside the panel rather than as a toast: this one asks the TM
            to do something (read the message, pick recipients, send) rather than
            telling them something happened, and it renders nothing at all when
            no one is affected. NotifyPanel returns null on a zero count. */}
        {saved && notify && (
          <NotifyPanel
            tourId={tourId}
            change={notify.change}
            previousValue={notify.previousValue}
          />
        )}
      </form>

      {/* The rest of the show. These three were tabs on the show page until
          Brief 36 step 6 deleted it, and this panel is where a TM already is
          when they want them. Advance opens a panel; travel and hotels are
          workspaces, wide enough that they stay full routes. */}
      <div className="mt-5 space-y-1 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => open({ type: 'advance', tourId, showId, venueName })}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
        >
          Advance
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <Link
          href={`/tours/${tourId}/shows/${showId}/planner`}
          onClick={close}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
        >
          Plan travel
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>

        <Link
          href={`/tours/${tourId}/shows/${showId}/hotels`}
          onClick={close}
          className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted/50"
        >
          Find hotels
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </Link>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => setDeleteOpen(true)}
        >
          Delete show
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this show?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {venueName} and its day sheet and advance status from the tour.
              The day reverts to travel or day off. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Deleting...' : 'Delete show'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelShell>
  )
}
