'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { PanelDeleteMenu } from '@/components/schedule/panels/panel-delete-menu'
import { ListRow } from '@/components/ui/list-row'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useEntityForm } from '@/hooks/use-entity-form'
import { readForm } from '@/lib/forms/read-form'
import {
  getGuestList,
  createGuestEntry,
  approveGuestEntry,
  declineGuestEntry,
  removeGuestEntry,
  setGuestListCutoff,
  setGuestListLock,
  sendGuestConfirmations,
  type GuestListView,
} from '@/lib/actions/guest-list'
import { allotmentLines, waitingPhrase } from '@/lib/schedule/guest-list-summary'
import { guestTypeLabel, passTypeLabel } from '@/lib/guest-list/vocabulary'
import { toDatetimeLocal, fromDatetimeLocal } from '@/lib/schedule/datetime'
import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'

interface GuestListPanelProps {
  tourId: string
  showId: string
  venueName: string
}

type Entry = Tables<'guest_list_entries'>

// A show's guest list, the TM's working surface for names on the door. Brief 52,
// step 4 (REE-131).
//
// Loads on open rather than being handed its data, the same shape as
// venue-panel.tsx: the day view would otherwise fetch a whole list on every date
// click to feed a panel a TM opens occasionally. A failed load says so ("Could
// not load the guest list") rather than rendering an empty list, which would
// read as "nobody is on the list" and is the confident, plausible, wrong answer
// a failed read must never become.
export function GuestListPanel({ tourId, showId, venueName }: GuestListPanelProps) {
  const [view, setView] = useState<GuestListView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // A silent re-read after a mutation. It does not toggle `loading`, so the list
  // does not flash back to a spinner every time the TM approves a name. The
  // server actions revalidate the schedule route for the day-info count; this
  // keeps the panel's own copy in step.
  const refresh = useCallback(async () => {
    const result = await getGuestList(showId)
    if (result.error) setError(result.error)
    else {
      setError(null)
      setView(result)
    }
  }, [showId])

  useEffect(() => {
    let cancelled = false
    getGuestList(showId)
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else setView(result)
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the guest list.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [showId])

  const entries = view?.entries ?? []
  const waiting = entries.filter((e) => e.status === 'requested')
  const approved = entries.filter((e) => e.status === 'approved')
  const declined = entries.filter((e) => e.status === 'declined')
  const lines = view ? allotmentLines(entries, view.allotments) : []

  return (
    <PanelShell title={venueName} description="Guest list">
      {loading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {error && <p className="text-xs text-destructive">Could not load the guest list.</p>}

      {view && !error && (
        <div className="space-y-6">
          <AddGuestForm tourId={tourId} showId={showId} onAdded={refresh} />

          {lines.length > 0 && (
            <section className="space-y-1">
              {lines.map((line) => (
                <p
                  key={line.passType}
                  className={cn('text-xs', line.over ? 'font-medium text-amber-600' : 'text-muted-foreground')}
                >
                  {line.label}
                  {line.over && ' (over)'}
                </p>
              ))}
            </section>
          )}

          <GuestGroup
            title="Waiting"
            count={waiting.length}
            countSuffix={waiting.length > 0 ? waitingPhrase(waiting.length) : undefined}
            entries={waiting}
            tourId={tourId}
            onChanged={refresh}
          />

          <GuestGroup
            title="On the list"
            count={approved.length}
            entries={approved}
            tourId={tourId}
            onChanged={refresh}
            action={<SendConfirmations showId={showId} disabled={approved.length === 0} />}
          />

          {declined.length > 0 && (
            <GuestGroup
              title="Declined"
              count={declined.length}
              entries={declined}
              tourId={tourId}
              onChanged={refresh}
            />
          )}

          <GuestListSettings
            showId={showId}
            cutoffAt={view.cutoffAt}
            locked={view.locked}
            timezone={view.timezone}
            onChanged={refresh}
          />
        </div>
      )}
    </PanelShell>
  )
}

function guestName(entry: Entry): string {
  const name = [entry.first_name, entry.last_name].filter(Boolean).join(' ').trim()
  return name || 'Unnamed guest'
}

// The pass and ticket line under a name, e.g. "2 x Ticket, Industry". Kept short:
// the panel is a working list, not a record card.
function guestDetail(entry: Entry): string {
  const tickets = `${entry.num_tickets} x ${passTypeLabel(entry.pass_type)}`
  const type = entry.guest_type ? guestTypeLabel(entry.guest_type) : null
  return [tickets, type].filter(Boolean).join(', ')
}

// The TM's own add. Names only here: a name the TM types is on the list, so
// createGuestEntry writes it approved with a default ticket, and the rest of the
// detail is edited later. Controlled inputs so the fields clear on a successful
// add without a form-level reset.
function AddGuestForm({
  tourId,
  showId,
  onAdded,
}: {
  tourId: string
  showId: string
  onAdded: () => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const { submit, pending, error } = useEntityForm({
    action: (fd) => {
      const data = readForm(fd, { first_name: 'string', last_name: 'string' })
      return createGuestEntry({
        tour_id: tourId,
        show_id: showId,
        first_name: data.first_name,
        last_name: data.last_name,
      })
    },
    // The add-form pattern: refresh on the client so the day-info block's
    // server-rendered count picks the new name up. Relying on createGuestEntry's
    // revalidatePath alone was racy here (a startTransition-dispatched action does
    // not reliably re-resolve a server-rendered sibling), which is what the e2e
    // caught. onAdded still re-reads the panel's own client-side list.
    refreshOnSuccess: true,
    onSuccess: () => {
      setFirstName('')
      setLastName('')
      onAdded()
    },
  })

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">First name</Label>
          <Input
            name="first_name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Last name</Label>
          <Input
            name="last_name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" disabled={pending} className="w-full">
        {pending ? 'Adding...' : 'Add to the list'}
      </Button>
    </form>
  )
}

function GuestGroup({
  title,
  count,
  countSuffix,
  entries,
  tourId,
  onChanged,
  action,
}: {
  title: string
  count: number
  countSuffix?: string
  entries: Entry[]
  tourId: string
  onChanged: () => void
  action?: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {countSuffix ?? `${title} (${count})`}
        </p>
        {action}
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No names here yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => (
            <GuestRow key={entry.id} entry={entry} tourId={tourId} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}

function GuestRow({
  entry,
  tourId,
  onChanged,
}: {
  entry: Entry
  tourId: string
  onChanged: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // onChanged re-reads the panel's own list; router.refresh re-resolves the
  // day-info block's server-rendered count. Both, for the same reason the add
  // form refreshes: the revalidatePath inside the action does not reliably reach
  // a server-rendered sibling on its own.
  function approve() {
    startTransition(async () => {
      await approveGuestEntry(tourId, entry.id)
      onChanged()
      router.refresh()
    })
  }

  function decline() {
    startTransition(async () => {
      await declineGuestEntry(tourId, entry.id)
      onChanged()
      router.refresh()
    })
  }

  // Removing a name is a soft delete: status becomes 'removed' via
  // removeGuestEntry, never a hard delete, so the record of who asked survives
  // for the promoter's question later.
  //
  // router.refresh() re-resolves the day-info block's server-rendered count, the
  // same as the transport and venue delete menus: this runs from PanelDeleteMenu's
  // plain click handler, not through a transition, so removeGuestEntry's
  // revalidatePath does not auto-apply the way the add and approve paths' do.
  // onChanged() separately re-reads the panel's own client-side list.
  async function remove(): Promise<string | null> {
    const result = await removeGuestEntry(entry.id)
    if (result.error) return result.error
    onChanged()
    router.refresh()
    return null
  }

  return (
    <ListRow className="flex items-center gap-2 px-3 py-2" interactive={false}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{guestName(entry)}</span>
        <span className="block truncate text-xs text-muted-foreground">{guestDetail(entry)}</span>
      </span>
      {entry.status === 'requested' && (
        <span className="flex shrink-0 items-center gap-1">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={pending} onClick={approve}>
            Approve
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" disabled={pending} onClick={decline}>
            Decline
          </Button>
        </span>
      )}
      <PanelDeleteMenu
        triggerLabel={`Options for ${guestName(entry)}`}
        menuLabel="Remove from the list"
        confirmLabel="Remove"
        pendingLabel="Removing..."
        dialogTitle="Remove this name?"
        dialogDescription="This takes them off the door. The record of who asked is kept. This cannot be undone."
        onConfirm={remove}
      />
    </ListRow>
  )
}

function SendConfirmations({ showId, disabled }: { showId: string; disabled: boolean }) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function send() {
    setNote(null)
    startTransition(async () => {
      const result = await sendGuestConfirmations(showId)
      if (result.error) setNote(result.error)
      else if (result.count === 0) setNote('No one to notify.')
      else setNote(`Sent to ${result.count}.`)
    })
  }

  return (
    <span className="flex items-center gap-2">
      {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={disabled || pending} onClick={send}>
        {pending ? 'Sending...' : 'Send confirmations'}
      </Button>
    </span>
  )
}

// The cutoff and the manual lock. Either one closes the list to crew; neither
// ever blocks the TM. The cutoff renders and writes as tour-local wall clock, the
// transport-panel approach, so a stored UTC instant reads at the hour the TM set.
function GuestListSettings({
  showId,
  cutoffAt,
  locked,
  timezone,
  onChanged,
}: {
  showId: string
  cutoffAt: string | null
  locked: boolean
  timezone: string
  onChanged: () => void
}) {
  const [cutoff, setCutoff] = useState(toDatetimeLocal(cutoffAt, timezone))
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  function saveCutoff() {
    setSaved(false)
    startTransition(async () => {
      await setGuestListCutoff(showId, fromDatetimeLocal(cutoff, timezone) ?? null)
      setSaved(true)
      onChanged()
    })
  }

  function toggleLock(next: boolean) {
    startTransition(async () => {
      await setGuestListLock(showId, next)
      onChanged()
    })
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="space-y-1">
        <Label className="text-xs">Cutoff</Label>
        <div className="flex gap-2">
          <Input
            type="datetime-local"
            value={cutoff}
            onChange={(e) => {
              setCutoff(e.target.value)
              setSaved(false)
            }}
            className="h-7 text-xs"
          />
          <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={pending} onClick={saveCutoff}>
            Save
          </Button>
        </div>
        {saved && <p className="text-[11px] text-muted-foreground">Saved.</p>}
        <p className="text-[11px] text-muted-foreground">
          After this, crew can no longer add names. Clear it to reopen the list.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-xs">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          Lock the list
        </Label>
        <Switch checked={locked} disabled={pending} onCheckedChange={toggleLock} />
      </div>
    </section>
  )
}
