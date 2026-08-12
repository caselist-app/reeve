'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { approveGuestEntry, declineGuestEntry } from '@/lib/actions/guest-list'
import { passTypeLabel, pickupLabel } from '@/lib/guest-list/vocabulary'
import { useInboxCountStore, selectOpenCount } from '@/stores/inbox-count-store'
import type { GuestRequestSubject } from '@/lib/inbox/item'

interface Props {
  tourId: string
  subject: GuestRequestSubject
}

// A definition-list row that drops entirely when it has no value, rather than
// printing a dash or TBC: the same rule the day item comms lines follow, so a
// request with half its optional fields empty does not push the fields that
// matter down the screen.
function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

// "under an hour ago", "2 hours ago", "3 days ago". Local to this view: the
// wording only shows up against a cutoff here, so it does not warrant a shared
// helper next to relativeLabel's Today/Yesterday/date phrasing, which is a
// different question ("when did this arrive") from this one ("how long has
// the window been shut").
function agoLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'under an hour ago'
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

// The show's date column is a plain date, not a timestamptz: there is no
// tour-timezone conversion to do, so this reads it as a UTC calendar date
// rather than reaching for localDateInZone, which is for instants.
function formatShowDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}

function decrementInboxCount() {
  const { serverCount, override, setOverride } = useInboxCountStore.getState()
  const current = selectOpenCount(serverCount, override)
  setOverride(serverCount, current - 1)
}

// The guest list request view (brief 53, REE-152). The decision is one call,
// so Approve, Decline and Decide later are first level here, no side panel.
// The item resolves through decideGuestEntry's own resolveGuestRequestAttention
// (REE-134), never from this component: a successful decision just navigates
// back to /inbox, the same place Decide later goes, deliberately, since
// deferring is a supported outcome and not a lesser one.
export function GuestRequestItem({ tourId, subject }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const guestName = [subject.firstName, subject.lastName].filter(Boolean).join(' ').trim() || null

  const passLine =
    subject.passType === 'other' && subject.passTypeDetail
      ? `${passTypeLabel(subject.passType)} (${subject.passTypeDetail})`
      : passTypeLabel(subject.passType)

  const pickupLine = subject.pickup
    ? subject.pickup === 'other' && subject.pickupDetail
      ? `${pickupLabel(subject.pickup)} (${subject.pickupDetail})`
      : pickupLabel(subject.pickup)
    : null

  const askedByLine = subject.requesterName
    ? subject.requesterRole
      ? `${subject.requesterName} (${subject.requesterRole})`
      : subject.requesterName
    : null

  // A pending request past its cutoff, or on a locked list, says so and cannot
  // be approved (brief 53). This is a UI-level guard only: decideGuestEntry
  // itself does not enforce it, because deferring is exactly how a TM arrives
  // here after the window closed, and declining still has to work.
  const cutoffPassed = subject.cutoffAt !== null && new Date(subject.cutoffAt).getTime() < Date.now()
  const blockedReason = subject.locked
    ? 'Guest list is locked'
    : cutoffPassed
      ? `Guest list closed ${agoLabel(subject.cutoffAt as string)}`
      : null

  const decided = subject.status !== 'requested'

  function decide(decision: 'approve' | 'decline') {
    setError(null)
    startTransition(async () => {
      const result =
        decision === 'approve'
          ? await approveGuestEntry(tourId, subject.entryId)
          : await declineGuestEntry(tourId, subject.entryId)

      if (result.error) {
        setError(result.error)
        return
      }
      // alreadyDecided means the entry was not 'requested' any more when this
      // ran (decided elsewhere, e.g. Telegram, in the same moment), so
      // resolveGuestRequestAttention never ran and the badge already
      // accounted for it.
      if (!result.alreadyDecided) decrementInboxCount()
      router.push('/inbox')
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border px-4">
        <Field label="Guest" value={guestName} />
        <Field label="Email" value={subject.email} />
        <Field label="Tickets" value={String(subject.numTickets)} />
        <Field label="Pass" value={passLine} />
        <Field label="Pickup" value={pickupLine} />
        <Field label="Show" value={`${subject.venueName}, ${formatShowDate(subject.showDate)}`} />
        <Field label="Asked by" value={askedByLine} />
        <Field label="Note" value={subject.notes} />
      </div>

      {subject.allotment && (
        <p
          className={cn(
            'text-sm',
            subject.allotment.used > subject.allotment.allowed
              ? 'font-medium text-amber-600'
              : 'text-muted-foreground'
          )}
        >
          {subject.allotment.used} approved of {subject.allotment.allowed} tickets on this show
        </p>
      )}

      {blockedReason && <p className="text-sm font-medium text-amber-600">{blockedReason}</p>}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {decided ? (
        <p className="text-sm text-muted-foreground">This request was already {subject.status}.</p>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={pending || Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={() => decide('approve')}
          >
            Approve
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => decide('decline')}>
            Decline
          </Button>
          <Link href="/inbox" className="text-sm text-muted-foreground hover:text-foreground">
            Decide later
          </Link>
        </div>
      )}
    </div>
  )
}
