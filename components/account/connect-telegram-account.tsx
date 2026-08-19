'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { createAccountTelegramLinkToken } from '@/lib/actions/account'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'

interface Props {
  // Whether accounts.telegram_chat_id is already set. A connected account can
  // still generate a fresh link (to move to a new device), so this only changes
  // the copy, never disables the action.
  connected: boolean
}

// Lets the account holder generate a one-time Telegram deep link and copy it,
// then open it themselves to link their own chat. Delivery is manual by design,
// same as the crew ConnectTelegramPanel: Reeve never sends the link on its own.
export function ConnectTelegramAccount({ connected }: Props) {
  const [deepLink, setDeepLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleGenerate() {
    setPending(true)
    setError(null)
    setCopied(false)
    const result = await createAccountTelegramLinkToken()
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
    <div className="p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Telegram</h2>
          {connected && <StatusBadge label="Connected" variant="success" />}
        </div>
        <p className="text-sm text-muted-foreground">
          {connected
            ? 'Your Telegram is connected. Reeve messages you here. Generate a new link to move to another device.'
            : 'Connect your own Telegram so Reeve can message you directly. Generate a link, open it, and hit Start.'}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div>
          <Button type="button" onClick={handleGenerate} disabled={pending}>
            {pending ? 'Generating link...' : connected ? 'Generate new link' : 'Connect Telegram'}
          </Button>
        </div>

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
      </div>
    </div>
  )
}
