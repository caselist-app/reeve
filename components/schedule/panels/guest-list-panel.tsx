'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Lock } from 'lucide-react'
import { PanelShell } from '@/components/layout/panel-shell'
import { PanelDeleteMenu } from '@/components/schedule/panels/panel-delete-menu'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
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
  updateGuestEntry,
  approveGuestEntry,
  declineGuestEntry,
  removeGuestEntry,
  setGuestListCutoff,
  setGuestListLock,
  sendGuestConfirmations,
  type GuestListView,
} from '@/lib/actions/guest-list'
import { allotmentLines, summarise, waitingPhrase } from '@/lib/schedule/guest-list-summary'
import { useGuestCounts } from '@/stores/guest-list-count-store'
import { useInboxCountStore, selectOpenCount } from '@/stores/inbox-count-store'
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
  const setCount = useGuestCounts((s) => s.setCount)

  // setView plus the day-info block's count, in one place. The block reads the
  // count from the store rather than a server refresh, because this panel is
  // mounted above the schedule route and a revalidate/refresh across that
  // boundary is unreliable (REE-65). Every load and every mutation re-reads the
  // list (which IS reliable, it is a direct client call) and writes the count it
  // just derived here, so the block tracks the change with no server round trip.
  const applyView = useCallback(
    (result: GuestListView) => {
      setError(null)
      setView(result)
      setCount(showId, summarise(result.entries))
    },
    [showId, setCount],
  )

  // A silent re-read after a mutation. It does not toggle `loading`, so the list
  // does not flash back to a spinner every time the TM approves a name.
  const refresh = useCallback(async () => {
    const result = await getGuestList(showId)
    if (result.error) setError(result.error)
    else applyView(result)
  }, [showId, applyView])

  useEffect(() => {
    let cancelled = false
    getGuestList(showId)
      .then((result) => {
        if (cancelled) return
        if (result.error) setError(result.error)
        else applyView(result)
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
  }, [showId, applyView])

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
            showId={showId}
            onChanged={refresh}
          />

          <GuestGroup
            title="On the list"
            count={approved.length}
            entries={approved}
            tourId={tourId}
            showId={showId}
            onChanged={refresh}
            action={
              <SendConfirmations
                showId={showId}
                disabled={approved.length === 0}
                missingEmailCount={approved.filter((e) => !e.email && !e.notified_at).length}
              />
            }
          />

          {declined.length > 0 && (
            <GuestGroup
              title="Declined"
              count={declined.length}
              entries={declined}
              tourId={tourId}
              showId={showId}
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
  const [email, setEmail] = useState('')

  const { submit, pending, error } = useEntityForm({
    action: (fd) => {
      const data = readForm(fd, { first_name: 'string', last_name: 'string', email: 'string' })
      return createGuestEntry({
        tour_id: tourId,
        show_id: showId,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
      })
    },
    // No refreshOnSuccess: the day-info block updates through the guest count
    // store, written by onAdded's re-read, not a server refresh (REE-65).
    onSuccess: () => {
      setFirstName('')
      setLastName('')
      setEmail('')
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
      <div className="space-y-1">
        <Label className="text-xs">Email (optional)</Label>
        <Input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-7 text-xs"
        />
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
  showId,
  onChanged,
  action,
}: {
  title: string
  count: number
  countSuffix?: string
  entries: Entry[]
  tourId: string
  showId: string
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
            <GuestRow key={entry.id} entry={entry} tourId={tourId} showId={showId} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  )
}

// Approving or declining a requested entry resolves its Inbox row
// (resolveGuestRequestAttention, called from decideGuestEntry), so the badge
// in the sidebar needs to drop by one. That badge is server-rendered above
// this panel's route, so the panel cannot revalidate or refresh it (REE-65,
// REE-131); it writes the decrement into the shared store instead, stamped
// with the server count the sidebar last rendered (serverCount), which is
// what lets the badge accept it as still current. See
// stores/inbox-count-store.ts.
function decrementInboxCount() {
  const { serverCount, override, setOverride } = useInboxCountStore.getState()
  const current = selectOpenCount(serverCount, override)
  setOverride(serverCount, current - 1)
}

function GuestRow({
  entry,
  tourId,
  showId,
  onChanged,
}: {
  entry: Entry
  tourId: string
  showId: string
  onChanged: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [sending, startSend] = useTransition()
  const [sendNote, setSendNote] = useState<string | null>(null)
  const [editingEmail, setEditingEmail] = useState(false)
  const [emailDraft, setEmailDraft] = useState(entry.email ?? '')
  const [savingEmail, startSaveEmail] = useTransition()
  const [emailError, setEmailError] = useState<string | null>(null)

  // The TM's own add only ever collects a name (AddGuestForm), and a chat
  // request can skip the email question, so this is the one place either kind
  // of guest gets an email on file after the fact. updateGuestEntry already
  // supported this write; nothing in the UI called it (REE-172).
  function saveEmail() {
    setEmailError(null)
    startSaveEmail(async () => {
      const result = await updateGuestEntry(entry.id, { email: emailDraft })
      if (result.error) {
        setEmailError(result.error)
        return
      }
      setEditingEmail(false)
      onChanged()
    })
  }

  function cancelEmailEdit() {
    setEmailDraft(entry.email ?? '')
    setEmailError(null)
    setEditingEmail(false)
  }

  // onChanged re-reads the panel's list, which also writes the day-info block's
  // count into the guest count store. No server refresh: the block updates from
  // that store, not a revalidate across the panel/route boundary (REE-65).
  function approve() {
    setSendNote(null)
    startTransition(async () => {
      const result = await approveGuestEntry(tourId, entry.id)
      if (result.error) {
        setSendNote(result.error)
        return
      }
      // alreadyDecided means the entry was not 'requested' any more when the
      // action ran (e.g. decided from Telegram in the same moment), so
      // resolveGuestRequestAttention never ran and the badge already
      // accounted for it.
      if (!result.alreadyDecided) decrementInboxCount()
      onChanged()
    })
  }

  function decline() {
    setSendNote(null)
    startTransition(async () => {
      const result = await declineGuestEntry(tourId, entry.id)
      if (result.error) {
        setSendNote(result.error)
        return
      }
      if (!result.alreadyDecided) decrementInboxCount()
      onChanged()
    })
  }

  // The per-row send, the same action as the bulk button with this one id. The
  // action and the job both re-check approved/has-email/not-yet-notified, so a
  // guest with no email or one already told is a no-op with a note, not a resend.
  function sendConfirmation() {
    setSendNote(null)
    startSend(async () => {
      const result = await sendGuestConfirmations(showId, [entry.id])
      if (result.error) setSendNote(result.error)
      else if (result.count === 0) setSendNote(entry.email ? 'Already sent.' : 'No email on file.')
      else setSendNote('Sent.')
      onChanged()
    })
  }

  // Removing a name is a soft delete: status becomes 'removed' via
  // removeGuestEntry, never a hard delete, so the record of who asked survives
  // for the promoter's question later.
  async function remove(): Promise<string | null> {
    const result = await removeGuestEntry(entry.id)
    if (result.error) return result.error
    // onChanged re-reads the list and writes the new count into the store, which
    // is what updates the day-info block: no server refresh, so nothing depends
    // on a repaint across the panel/route boundary (REE-65).
    onChanged()
    return null
  }

  if (editingEmail) {
    return (
      <ListRow className="space-y-2 px-3 py-2" interactive={false}>
        <span className="block truncate text-sm font-medium">{guestName(entry)}</span>
        <div className="flex items-center gap-1.5">
          <Input
            type="email"
            value={emailDraft}
            onChange={(e) => setEmailDraft(e.target.value)}
            placeholder="Email"
            className="h-7 flex-1 text-xs"
            autoFocus
          />
          <Button type="button" size="sm" className="h-7 shrink-0 text-xs" disabled={savingEmail} onClick={saveEmail}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 text-xs"
            disabled={savingEmail}
            onClick={cancelEmailEdit}
          >
            Cancel
          </Button>
        </div>
        {emailError && <p className="text-[11px] text-destructive">{emailError}</p>}
      </ListRow>
    )
  }

  return (
    <ListRow className="flex items-center gap-2 px-3 py-2" interactive={false}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{guestName(entry)}</span>
        <span className="block truncate text-xs text-muted-foreground">{guestDetail(entry)}</span>
        {sendNote && <span className="block truncate text-[11px] text-muted-foreground">{sendNote}</span>}
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
        extraItems={
          <>
            <DropdownMenuItem onSelect={() => setEditingEmail(true)}>
              {entry.email ? 'Edit email' : 'Add email'}
            </DropdownMenuItem>
            {/* Only an approved, not-yet-told guest can be sent to. A second send to
               an already-notified entry is a no-op by design (the action filters on
               notified_at), so a "Resend" item would lie: it is omitted instead. */}
            {entry.status === 'approved' && !entry.notified_at && (
              <DropdownMenuItem disabled={sending} onSelect={sendConfirmation}>
                Send confirmation
              </DropdownMenuItem>
            )}
          </>
        }
      />
    </ListRow>
  )
}

function SendConfirmations({
  showId,
  disabled,
  missingEmailCount,
}: {
  showId: string
  disabled: boolean
  // Approved, not-yet-told guests with no email on file. A zero count from the
  // send is otherwise indistinguishable between "everyone already notified"
  // and "no one here has an email", and the latter used to read as a silent
  // no-op the TM had no way to explain (REE-172).
  missingEmailCount: number
}) {
  const [pending, startTransition] = useTransition()
  const [note, setNote] = useState<string | null>(null)

  function send() {
    setNote(null)
    startTransition(async () => {
      const result = await sendGuestConfirmations(showId)
      if (result.error) setNote(result.error)
      else if (result.count === 0) {
        setNote(
          missingEmailCount > 0
            ? `No one to notify (${missingEmailCount} with no email on file).`
            : 'No one to notify.',
        )
      } else setNote(`Sent to ${result.count}.`)
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
  const [error, setError] = useState<string | null>(null)

  function saveCutoff() {
    setSaved(false)
    setError(null)
    startTransition(async () => {
      const result = await setGuestListCutoff(showId, fromDatetimeLocal(cutoff, timezone) ?? null)
      if (result.error) {
        setError(result.error)
        return
      }
      setSaved(true)
      onChanged()
    })
  }

  function toggleLock(next: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await setGuestListLock(showId, next)
      if (result.error) {
        setError(result.error)
        return
      }
      onChanged()
    })
  }

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <div className="space-y-1">
        <Label htmlFor="guest-list-cutoff" className="text-xs">
          Cutoff
        </Label>
        <div className="flex gap-2">
          <Input
            id="guest-list-cutoff"
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

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </section>
  )
}
