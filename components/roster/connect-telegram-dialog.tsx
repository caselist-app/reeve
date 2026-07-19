'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createTelegramLinkToken } from '@/lib/actions/contacts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface Props {
  contactId: string
  contactName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Generates a one-time Telegram deep link and lets the TM copy it. Delivery
// is manual by design: the TM pastes the link into whatever channel already
// reaches this person (existing WhatsApp thread, email, a QR code at
// load-in). Reeve does not send it on its own.
export function ConnectTelegramDialog({ contactId, contactName, open, onOpenChange }: Props) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  // The parent opens this dialog by flipping `open` directly (a menu item
  // sets state, it doesn't go through Radix), and Radix only calls
  // onOpenChange for its own close-triggered transitions (Escape, overlay
  // click). So generation can't live in onOpenChange, it has to watch the
  // `open` prop itself to fire on every open regardless of who changed it.
  useEffect(() => {
    if (!open) {
      setDeepLink(null)
      setError(null)
      setCopied(false)
      return
    }
    let cancelled = false
    setPending(true)
    setError(null)
    void createTelegramLinkToken(contactId).then((result) => {
      if (cancelled) return
      if (result.error) {
        setError(result.error)
      } else if (result.deepLink) {
        setDeepLink(result.deepLink)
      }
      setPending(false)
    })
    return () => {
      cancelled = true
    }
  }, [open, contactId])

  async function handleCopy() {
    if (!deepLink) return
    await navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Connect {contactName} on Telegram</AlertDialogTitle>
          <AlertDialogDescription>
            Send this link however suits: paste it into a message, or share it at load-in.
            They tap it, hit Start in Telegram, and Reeve links their account.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {pending && <p className="text-sm text-muted-foreground">Generating link...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {deepLink && (
          <div className="flex items-center gap-2 overflow-hidden rounded-md border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-sm">{deepLink}</code>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogAction>Done</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
