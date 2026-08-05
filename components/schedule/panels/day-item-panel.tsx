'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PanelShell } from '@/components/layout/panel-shell'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
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
import { updateDayItem, deleteDayItem } from '@/lib/actions/day-items'
import { dayItemLabel } from '@/lib/schedule/day-item-kinds'
import { localTimeInZone } from '@/lib/schedule/datetime'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import { useSidePanel } from '@/stores/side-panel-store'
import { NotifyPanel } from '@/components/broadcast/notify-panel'
import type { Tables } from '@/lib/types/database'
import type { ChangeDescriptor } from '@/lib/comms/affected'

type DayItem = Pick<
  Tables<'day_items'>,
  'id' | 'show_id' | 'kind' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
>

interface DayItemPanelProps {
  item: DayItem
  tourId: string
  timezone: string
}

// One panel for anything on a day. Brief 42, REE-17.
//
// It replaces two: the show panel, which was twenty time fields for a show that
// might have three of them, and the event panel, which edited the one kind of
// item that was not a column. A load-in and a press call are the same shape now,
// so they get the same form, and the form is small because an item is small.
//
// Times are HH:MM in the tour's timezone, not datetime-local. The day an item
// belongs to is tour_date_id and is not editable here: a date input beside a
// time input invites a TM to move an item to another day, and the action
// deliberately cannot do that yet, so offering it would be a control that
// silently does nothing. See lib/validators/day-item.ts.

// Which kinds are worth offering to tell crew about when they move. Same two the
// show panel offered, and the same reasoning: a load-in affects everyone
// travelling to the venue that day, and a curfew affects transport home.
//
// Ordered, so a save that moves both offers one message rather than two, and
// load_in wins because it reaches more people.
const NOTIFY_KINDS = ['load_in', 'curfew'] as const

type NotifyState = {
  change: Extract<ChangeDescriptor, { type: 'show' }>
  previousValue: string | null
}

function toClock(iso: string | null, tz: string): string {
  return iso ? localTimeInZone(iso, tz) : ''
}

export function DayItemPanel({ item, tourId, timezone }: DayItemPanelProps) {
  const router = useRouter()
  const { close } = useSidePanel()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notify, setNotify] = useState<NotifyState | null>(null)

  const label = dayItemLabel(item.kind)
  const isCustom = item.kind === 'other'

  // The start as last saved, in the same HH:MM frame the input uses, so the
  // change check compares like with like.
  //
  // Held in state rather than read from the item prop on each save. The prop
  // comes from the side-panel store card, captured when the timeline item was
  // clicked, and updateDayItem revalidates the route rather than reopening the
  // panel, so it does not update. Comparing against it would work on the first
  // save and then compare every later save against the original value, offering
  // to tell crew about a change the TM already sent.
  const [savedStart, setSavedStart] = useState(() => toClock(item.starts_at, timezone))

  async function handleDelete() {
    setDeleting(true)
    const result = await deleteDayItem(item.id)
    setDeleting(false)
    if (result.error) {
      setDeleteError(result.error)
      return
    }
    setDeleteOpen(false)
    close()
    router.refresh()
  }

  // Set by action() before the server action runs, read by onSuccess after it
  // resolves. Same shape as show-form.tsx's submittedData.
  let submittedStart: string | null | undefined

  const { submit, pending, error, saved } = useEntityForm({
    action: (fd) => {
      setNotify(null)
      const data = readForm(fd, {
        title: 'string',
        start_clock: 'string',
        end_clock: 'string',
        location: 'string',
        notes: 'string',
      })
      submittedStart = data.start_clock
      return updateDayItem(item.id, data)
    },
    onSuccess: () => {
      const start = submittedStart
      if (start === undefined) return

      const isNotifiable = (NOTIFY_KINDS as readonly string[]).includes(item.kind)
      // A freeform item has no show to hang a change alert off, and the alert's
      // descriptor is keyed by show. Nothing to offer, so nothing is offered.
      if (isNotifiable && item.show_id && (start ?? '') !== savedStart) {
        setNotify({
          change: {
            type: 'show',
            showId: item.show_id,
            field: item.kind === 'load_in' ? 'load_in' : 'curfew',
          },
          // Null when there was nothing there before: an initial entry is not a
          // change to anything, and "was TBC" reads worse than saying nothing.
          previousValue: savedStart || null,
        })
      }

      // Recorded whether or not it was notifiable, so the next save compares
      // against what is actually stored.
      setSavedStart(start ?? '')
    },
  })

  return (
    <PanelShell title={item.title || label} description={item.title ? label : 'On this day'}>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs">{isCustom ? 'Name' : 'Name (optional)'}</Label>
          <Input
            name="title"
            defaultValue={item.title ?? ''}
            required={isCustom}
            // From the brief's own example: 'Tesseract sound' is a soundcheck
            // titled Tesseract. A qualifier on any kind, not only on a custom
            // item.
            placeholder={isCustom ? 'Press call, after show...' : 'Tesseract, support...'}
            className="h-7 text-xs"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Starts</Label>
            <Input
              name="start_clock"
              type="time"
              defaultValue={toClock(item.starts_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Ends (optional)</Label>
            <Input
              name="end_clock"
              type="time"
              defaultValue={toClock(item.ends_at, timezone)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Location</Label>
          <Input
            name="location"
            defaultValue={item.location ?? ''}
            placeholder="Optional"
            className="h-7 text-xs"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea name="notes" defaultValue={item.notes ?? ''} rows={3} className="text-xs" />
        </div>

        {(error || deleteError) && (
          <p className="text-xs text-destructive">{error || deleteError}</p>
        )}
        <Button type="submit" size="sm" disabled={pending} className="w-full">
          {pending ? 'Saving...' : 'Save'}
        </Button>
        {saved && <p className="text-xs text-muted-foreground text-center">Saved.</p>}

        {/* Rendered inside the panel rather than as a toast: this one asks the TM
            to do something (read the message, pick recipients, send) rather than
            telling them something happened, and it renders nothing at all when
            no one is affected. NotifyPanel returns null on a zero count. */}
        {saved && notify && (
          <NotifyPanel tourId={tourId} change={notify.change} previousValue={notify.previousValue} />
        )}
      </form>

      <div className="mt-5 border-t border-border pt-4">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => setDeleteOpen(true)}
        >
          Remove from the day
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.title || label.toLowerCase()}?</AlertDialogTitle>
            <AlertDialogDescription>
              This takes it off the day. Nothing else on the day changes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelShell>
  )
}
