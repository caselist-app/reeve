'use client'

import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createTelegramLinkToken } from '@/lib/actions/contacts'
import { PanelShell } from '@/components/layout/panel-shell'
import { Button } from '@/components/ui/button'

interface Props {
  contactId: string
  contactName: string
  // Leaves this panel. From contact-panel.tsx this reopens the contact-view
  // panel underneath; from contact-detail.tsx, opened straight off a page
  // rather than another panel, it closes the side panel outright. Supplied
  // by the descriptor, the same shape as add-to-day's onBack.
  onBack: () => void
}

// REE-224: the one non-destructive AlertDialog in the repo, moved to the
// global side panel. Generates a one-time Telegram deep link and lets the TM
// copy it. Delivery is manual by design: the TM pastes the link into
// whatever channel already reaches this person (existing WhatsApp thread,
// email, a QR code at load-in). Reeve does not send it on its own.
export function ConnectTelegramPanel({ contactId, contactName, onBack }: Props) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)
  const [copied, setCopied] = useState(false)

  // The panel mounts fresh on every open (unlike the old AlertDialog, which
  // stayed mounted and watched an `open` prop), so generating on mount is
  // enough to fire on every open.
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
    <PanelShell title={`Connect ${contactName} on Telegram`}>
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

      <Button type="button" variant="outline" size="sm" className="mt-6" onClick={onBack}>
        Done
      </Button>
    </PanelShell>
  )
}
