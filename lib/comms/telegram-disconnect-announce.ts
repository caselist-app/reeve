import { notifyAccount } from '@/lib/comms/notify/account'
import { writeDisconnectAttention } from '@/lib/comms/disconnect-attention'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Tells the TM a crew contact has disconnected their Telegram: an
// attention_items row for the Inbox and a Telegram DM. Brief 63, step 4
// (REE-309). Same split as lib/comms/guest-request-announce.ts: the Inbox row
// is the durable record, the DM is the alert on top of it, and this is the one
// place that sequences them, so a caller only has to await one function.
//
// telegram_disconnect has no NotificationDataMap entry or registry renderer:
// unlike guest_request, there is nothing else that ever needs to render this
// message, so the rendered payload is built inline rather than through the
// registry (same reasoning as flight_status_alert's message-only shape, minus
// even that indirection).

type Client = SupabaseClient<Database>

export interface DisconnectAnnouncement {
  contactId: string
  contactName: string
}

export async function announceDisconnectToTm(
  supabase: Client,
  a: DisconnectAnnouncement,
): Promise<void> {
  const written = await writeDisconnectAttention(supabase, a)
  // No tour to resolve (a contact with no roster membership on any tour), or
  // the Inbox write itself failed: nothing to notify about or dedup against.
  if (!written) return

  // The account holder to alert. tours.account_id is the owner (CLAUDE.md).
  const { data: tour } = await supabase
    .from('tours')
    .select('account_id')
    .eq('id', written.tourId)
    .maybeSingle()
  const accountId = tour?.account_id ?? null
  if (!accountId) return

  // dedupDimension is the attention item's own id: a fresh row every genuine
  // disconnect (a contact can reconnect and disconnect again), so a retry of
  // this same event is deduped while a later, distinct disconnect still sends.
  // notifyAccount returns no_channel when the TM has not linked their own
  // Telegram, which is a silent no-op here rather than an error.
  await notifyAccount({
    tourId: written.tourId,
    accountId,
    type: 'telegram_disconnect',
    dedupDimension: written.itemId,
    rendered: {
      body: `${a.contactName} disconnected from Telegram. They won't get schedule updates here until they reconnect.`,
    },
  })
}
