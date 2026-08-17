'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { previewDayResend, resendDay } from '@/lib/actions/day-message'
import { formatMoveDate } from '@/lib/schedule/date-move'

interface SendDayDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tourId: string
  tourDateId: string
}

type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; recipientCount: number; date: string; venueName: string }
  | { status: 'zero' }
  | { status: 'error' }

// REE-105's confirm for the "Send the day" menu item: a manual resend of the
// show-day message sequence (lib/actions/day-message.ts's resendDay) to every
// contactable crew member. Fetches a live recipient count on open rather than
// a stale one carried from the menu, since the TM might open this minutes
// after adding someone's WhatsApp number. Routed through ConfirmDialog, the
// one legitimate way to reach AlertDialogPrimitive (check:conventions rule
// 14): title and description are computed here per preview state, which is
// exactly what that component's own doc comment says they're for.
export function SendDayDialog({ open, onOpenChange, tourId, tourDateId }: SendDayDialogProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' })

  useEffect(() => {
    if (!open) return
    setPreview({ status: 'loading' })
    let cancelled = false
    previewDayResend(tourId, tourDateId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setPreview({ status: 'error' })
      } else if (result.recipientCount === 0) {
        setPreview({ status: 'zero' })
      } else {
        setPreview({
          status: 'ready',
          recipientCount: result.recipientCount,
          date: result.date ?? '',
          venueName: result.venueName ?? '',
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, tourId, tourDateId])

  async function handleConfirm(): Promise<string | null> {
    const result = await resendDay(tourId, tourDateId)
    if (result.error) return result.error
    toast(`Sent to ${result.sent ?? 0} crew.`)
    return null
  }

  const title =
    preview.status === 'ready' ? `Send the day to ${preview.recipientCount} crew?` : 'Send the day?'

  const description =
    preview.status === 'ready' ? (
      <>
        {formatMoveDate(preview.date)} at {preview.venueName}.
        <br />
        If they already have it, they get it again.
      </>
    ) : preview.status === 'zero' ? (
      'Nobody on this tour has a WhatsApp, Telegram or email address.'
    ) : preview.status === 'error' ? (
      'Could not check who would receive this.'
    ) : (
      "Checking who's on this tour..."
    )

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel="Send"
      pendingLabel="Sending..."
      destructive={false}
      confirmDisabled={preview.status === 'loading'}
      hideConfirm={preview.status === 'zero' || preview.status === 'error'}
      onConfirm={handleConfirm}
    />
  )
}
