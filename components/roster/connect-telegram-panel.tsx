'use client'

import { PanelShell } from '@/components/layout/panel-shell'
import { TelegramLinkGenerator } from '@/components/roster/telegram-link-generator'

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
// global side panel. REE-305 extracted the link generation itself into
// TelegramLinkGenerator so the same flow also renders inline in the contact
// edit form; this stays a thin PanelShell wrapper for its two existing
// callers (the contact view panel's "..." menu and the /roster/[id]
// fallback page).
export function ConnectTelegramPanel({ contactId, contactName, onBack }: Props) {
  return (
    <PanelShell title={`Connect ${contactName} on Telegram`}>
      <TelegramLinkGenerator contactId={contactId} onDone={onBack} />
    </PanelShell>
  )
}
