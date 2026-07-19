'use client'

import { useState } from 'react'
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

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (next) {
      void generate()
    } else {
      setDeepLink(null)
      setError(null)
      setCopied(false)
    }
  }

  async function generate() {
    setPending(true)
    setError(null)
    const result = await createTelegramLinkToken(contactId)
    if (result.error) {
      setError(result.error)
    } else if (result.deepLink) {
      setDeepLink(result.deepLink)
    }
    setPending(false)
  }

  async function handleCopy() {
    if (!deepLink) return
    await navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
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
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
            <code className="flex-1 truncate text-sm">{deepLink}</code>
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
