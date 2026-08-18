'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createTelegramLinkToken } from '@/lib/actions/contacts'
import { Button } from '@/components/ui/button'

interface Props {
  contactId: string
  onDone: () => void
}

// Generates a one-time Telegram deep link and lets the TM copy it. Delivery is
// manual by design: the TM pastes the link into whatever channel already
// reaches this person (existing WhatsApp thread, email, a QR code at
// load-in). Reeve does not send it on its own. Shared between the full
// connect-telegram panel and the inline trigger in the contact edit form
// (REE-305), so it renders no chrome of its own.
export function TelegramLinkGenerator({ contactId, onDone }: Props) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [copied, setCopied] = useState(false)

  // Mounts fresh on every open, so generating on mount is enough to fire on
  // every open.
  useEffect(() => {
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
  }, [contactId])

  async function handleCopy() {
    if (!deepLink) return
    await navigator.clipboard.writeText(deepLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Send this link however suits: paste it into a message, or share it at load-in.
        They tap it, hit Start in Telegram, and Reeve links their account.
      </p>

      {pending && <p className="mt-4 text-sm text-muted-foreground">Generating link...</p>}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {deepLink && (
        <div className="mt-4 flex items-center gap-2 overflow-hidden rounded-md border bg-muted/40 px-3 py-2">
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

      <Button type="button" variant="outline" size="sm" className="mt-6" onClick={onDone}>
        Done
      </Button>
    </>
  )
}
