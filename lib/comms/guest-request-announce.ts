import { registry } from '@/lib/comms/notify/registry'
import { notifyAccount } from '@/lib/comms/notify/account'
import { writeGuestRequestAttention } from '@/lib/guest-list/attention'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Tells the TM a /guest request has landed: an attention_items row for the Inbox
// and a Telegram message carrying Approve and Decline. Brief 52, step 7 (REE-134).
//
// Kept out of lib/comms/guest-request.ts's static import graph on purpose: that
// module's pure parser is unit tested with no server-only shim, and notifyAccount
// pulls in the admin client (server-only). handleGuestRequest reaches this through
// a dynamic import, so it only loads when the flow actually runs.
//
// The send goes to the account holder (notifyAccount, Telegram only), not to a
// crew person through notify(), so the registry's guest_request renderer is
// reused here rather than dispatched. The attention row is written with the
// caller's client so an integration test reading the same database sees it.

type Client = SupabaseClient<Database>

export interface GuestRequestAnnouncement {
  tourId: string
  entryId: string
  guestName: string
  numTickets: number
  passType: string
  venueName: string | null
  // Already formatted ("Friday 14 June") by the caller.
  showDate: string
  requesterName: string | null
  waitingCount: number
}

export async function announceGuestRequestToTm(
  supabase: Client,
  a: GuestRequestAnnouncement,
): Promise<void> {
  // The Inbox row first: it is the durable record the TM works from, and it is
  // written with the caller's client so it lands in the same database the flow
  // is running against. The Telegram nudge is the alert on top of it.
  await writeGuestRequestAttention(supabase, {
    tourId: a.tourId,
    entryId: a.entryId,
    title: `Guest request: ${a.guestName} for ${a.venueName ?? 'the show'}`,
  })

  // The account holder to alert. tours.account_id is the owner (CLAUDE.md).
  const { data: tour } = await supabase
    .from('tours')
    .select('account_id')
    .eq('id', a.tourId)
    .maybeSingle()
  const accountId = tour?.account_id ?? null
  if (!accountId) return

  const rendered = registry.guest_request.telegram!({
    entryId: a.entryId,
    guestName: a.guestName,
    numTickets: a.numTickets,
    passType: a.passType,
    venueName: a.venueName,
    showDate: a.showDate,
    requesterName: a.requesterName,
    waitingCount: a.waitingCount,
  })

  // dedupDimension is the entry id: one request, one message, even on a retry.
  // notifyAccount returns no_channel when the TM has not linked their Telegram,
  // so this is a silent no-op until they do rather than an error.
  await notifyAccount({
    tourId: a.tourId,
    accountId,
    type: 'guest_request',
    dedupDimension: a.entryId,
    rendered: await rendered,
  })
}
