import { task } from '@trigger.dev/sdk/v3'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/comms/email'
import { sendGuestConfirmationEmails } from '@/lib/guest-list/send-confirmations'

export type GuestConfirmationSendPayload = {
  showId: string
  // The specific approved entries to notify. The action resolves this set before
  // enqueue; the core re-checks approved/has-email/not-yet-notified at send time,
  // so a stale id or an already notified one cannot be forced through.
  entryIds: string[]
}

// Sends the guest their guest-list confirmation email. Brief 52, step 9
// (REE-136). Enqueued by sendGuestConfirmations() in lib/actions/guest-list.ts,
// never fired on approval: putting a name on the list and telling the guest are
// two separate TM actions.
//
// The idempotency here is notified_at on the entry, not a Redis claim: the core
// writes it only after the send returns and skips anything that already carries
// it, so a Trigger.dev retry re-runs the core and simply finds nothing left to
// send. No email leaves twice.
export const guestConfirmationSendJob = task({
  id: 'guest-confirmation-send',
  run: async (payload: GuestConfirmationSendPayload) => {
    const admin = createAdminClient()

    const result = await sendGuestConfirmationEmails(admin, {
      showId: payload.showId,
      entryIds: payload.entryIds,
      // The real email adapter. The branded from-address is advancing@{slug}.
      // tourwithreeve.com, resolved inside sendEmail from artist_slug.
      send: async ({ to, subject, html, artistSlug }) => {
        await sendEmail({ to, subject, html, artist_slug: artistSlug })
      },
    })

    return result
  },
})
