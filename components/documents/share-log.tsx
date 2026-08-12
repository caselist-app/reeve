'use client'

import { useState, useTransition } from 'react'
import { ListRow } from '@/components/ui/list-row'
import { cn } from '@/lib/utils'
import { resendShare } from '@/lib/actions/documents'
import type { DocumentShareRow } from '@/lib/documents/queries'

interface Props {
  shares: DocumentShareRow[]
  // Distinct from an empty log: a failed read must say so rather than render
  // as "Not yet sent.", which would be a confident, plausible, wrong answer.
  error?: string | null
}

// Rough granularity only, same as components/shows/advance-documents.tsx's
// relativeTime: "just now", "2h ago", "3 days ago". Kept local rather than
// shared, matching that file's own copy.
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const GRID = 'sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_92px_92px_108px_84px]'

const COLUMN_LABELS = ['Recipient', 'Show', 'Sent', 'Opened', 'Acknowledged', 'Action']

function ShareRow({ share }: { share: DocumentShareRow }) {
  const [error, setError] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleResend() {
    setError(null)
    startTransition(async () => {
      const result = await resendShare(share.id)
      if (result.error) setError(result.error)
      else setResent(true)
    })
  }

  const sentLabel = share.sent_at ? relativeTime(share.sent_at) : 'Sending...'
  const reminderSuffix =
    share.reminder_count > 0
      ? ` · ${share.reminder_count} reminder${share.reminder_count === 1 ? '' : 's'} sent`
      : ''

  return (
    <ListRow
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg border-transparent bg-muted/40 px-3 py-2 text-sm sm:items-center sm:gap-4',
        GRID
      )}
    >
      <div className="col-span-2 min-w-0 sm:col-span-1">
        <p className="truncate font-medium" title={share.recipient_email ?? undefined}>
          {share.recipient_name}
        </p>
        {share.recipient_role && (
          <p className="truncate text-xs text-muted-foreground">{share.recipient_role}</p>
        )}
      </div>

      <p className="truncate text-muted-foreground">
        {share.show_id ? (share.show_label ?? 'Show') : 'Tour'}
      </p>

      <p className="text-xs text-muted-foreground sm:text-sm">
        <span className="text-muted-foreground/70 sm:hidden">Sent </span>
        {sentLabel}
        {reminderSuffix}
      </p>

      <p className="text-xs text-muted-foreground sm:text-sm">
        <span className="text-muted-foreground/70 sm:hidden">Opened </span>
        {share.opened_at ? relativeTime(share.opened_at) : '-'}
      </p>

      <p className="text-xs text-muted-foreground sm:text-sm">
        <span className="text-muted-foreground/70 sm:hidden">Acknowledged </span>
        {share.acknowledged_at ? relativeTime(share.acknowledged_at) : '-'}
      </p>

      <div className="text-xs sm:text-sm">
        {share.acknowledged_at ? (
          <span className="text-muted-foreground">{'-'}</span>
        ) : share.show_id ? (
          <button
            type="button"
            onClick={handleResend}
            disabled={isPending || resent}
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
          >
            {resent ? 'Resent' : isPending ? 'Resending...' : 'Resend'}
          </button>
        ) : (
          <span className="text-muted-foreground">{'-'}</span>
        )}
      </div>

      {error && <p className="col-span-2 text-xs text-destructive sm:col-span-6">{error}</p>}
    </ListRow>
  )
}

// Six columns per send: recipient, show, sent, opened, acknowledged, action.
// "Tour" in the Show column when a share has no show_id: a document can be
// sent at the tour level, not tied to any one show.
export function ShareLog({ shares, error }: Props) {
  if (error) {
    return <p className="text-xs text-destructive">{error}</p>
  }

  if (shares.length === 0) {
    return <p className="text-xs text-muted-foreground">Not yet sent.</p>
  }

  return (
    <div className="space-y-1.5">
      <div className={cn('hidden text-xs font-medium text-muted-foreground sm:grid sm:gap-4 sm:px-3', GRID)}>
        {COLUMN_LABELS.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
      {shares.map((share) => (
        <ShareRow key={share.id} share={share} />
      ))}
    </div>
  )
}
