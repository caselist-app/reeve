'use client'

import { useEffect, useState, useTransition } from 'react'
import { Bell, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { previewBroadcast, sendBroadcast } from '@/lib/actions/broadcast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { ChangeDescriptor } from '@/lib/comms/affected'

interface NotifyPanelProps {
  tourId: string
  change: ChangeDescriptor
  // Human-readable previous value to include in the "was X" part of the message.
  // Pass null if this is an initial entry with no prior value.
  previousValue?: string | null
  className?: string
}

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; people: { id: string; name: string }[]; message: string }
  | { status: 'error'; message: string }

export function NotifyPanel({
  tourId,
  change,
  previousValue,
  className,
}: NotifyPanelProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [expanded, setExpanded] = useState(false)
  const [customMessage, setCustomMessage] = useState('')
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Fetch affected people and message preview on first render.
  // Runs immediately so the chip can show a count without a click.
  useEffect(() => {
    setPreview({ status: 'loading' })
    previewBroadcast(tourId, change, previousValue)
      .then((result) => {
        setPreview({ status: 'ready', people: result.people, message: result.message })
      })
      .catch(() => {
        setPreview({ status: 'error', message: 'Could not load affected people.' })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (sent) {
    const count =
      preview.status === 'ready' ? preview.people.length : 0
    return (
      <p className={cn('text-sm text-muted-foreground', className)}>
        Sent to {count} {count === 1 ? 'person' : 'people'}.
      </p>
    )
  }

  const isReady = preview.status === 'ready'
  const count = isReady ? preview.people.length : null

  if (count === 0) {
    // No one to notify - don't render the panel at all.
    return null
  }

  function handleSend() {
    setSendError(null)
    startTransition(async () => {
      const result = await sendBroadcast({
        tourId,
        change,
        previousValue,
        customMessage: customMessage || null,
      })
      if (result.error) {
        setSendError(result.error)
      } else {
        setSent(true)
      }
    })
  }

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3', className)}>
      {/* Collapsed chip */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm">
          <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
          {preview.status === 'loading' && (
            <span className="text-muted-foreground">Checking affected crew...</span>
          )}
          {preview.status === 'error' && (
            <span className="text-muted-foreground">{preview.message}</span>
          )}
          {isReady && count !== null && (
            <span>
              <span className="font-medium">{count} {count === 1 ? 'person' : 'people'}</span>
              {' '}affected by this change{count > 0 ? ' — Notify them' : ''}
            </span>
          )}
        </span>
        {isReady && count !== null && count > 0 && (
          expanded
            ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
            : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded panel */}
      {expanded && isReady && preview.people.length > 0 && (
        <div className="mt-3 space-y-3 border-t pt-3">
          {/* Auto-generated message */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Message
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm font-sans">
              {preview.message}
            </pre>
          </div>

          {/* Affected people */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Recipients
            </p>
            <ul className="space-y-0.5 text-sm">
              {preview.people.map((p) => (
                <li key={p.id} className="text-muted-foreground">{p.name}</li>
              ))}
            </ul>
          </div>

          {/* Custom note */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Add a note (optional)
            </p>
            <Textarea
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Anything else crew should know..."
              rows={2}
              className="text-sm"
            />
          </div>

          {sendError && (
            <p className="text-sm text-destructive">{sendError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSend}
              disabled={isPending}
            >
              {isPending ? 'Sending...' : `Send to ${preview.people.length}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setExpanded(false)}
              disabled={isPending}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
