import { task } from '@trigger.dev/sdk/v3'
import { sendEmail } from '@/lib/comms/email'
import { renderRiderEmail } from '@/lib/comms/templates/rider-email'
import { redis } from '@/lib/redis'

export type RiderEmailPayload = {
  // Resolved by sendRider() before enqueue so this job is pure data in / email out.
  to: string
  recipient_name: string
  artist_name: string
  artist_slug: string | null
  document_title: string
  share_token: string
  share_url: string
  note?: string | null
}

// Sends the initial rider or advance document email to a venue contact.
// Enqueued by sendRider() in lib/actions/documents.ts.
// sendEmail() writes sent_at to document_shares when share_token is provided.
//
// Claim-send-release, matching lib/comms/notify/index.ts: without the claim,
// a Trigger.dev retry would email the venue contact a second time. Keyed on
// share_token since sendRider() mints a fresh one per send (a deliberate
// resend to a different contact gets its own token and is unaffected).
export const sendRiderEmailJob = task({
  id: 'send-rider-email',
  run: async (payload: RiderEmailPayload) => {
    const claimKey = `rider-email:sent:${payload.share_token}`

    let claimed: string | null = 'ok'
    try {
      claimed = await redis.set(claimKey, '1', { nx: true, ex: 60 * 60 * 24 })
    } catch {
      // Redis unavailable: proceed rather than drop a rider email delivery.
    }
    if (claimed === null) {
      return { sent: false, to: payload.to, reason: 'duplicate' }
    }

    const html = renderRiderEmail({
      recipientName: payload.recipient_name,
      artistName: payload.artist_name,
      documentTitle: payload.document_title,
      note: payload.note,
      shareUrl: payload.share_url,
    })

    try {
      await sendEmail({
        to: payload.to,
        subject: `${payload.document_title}, ${payload.artist_name}`,
        html,
        artist_slug: payload.artist_slug,
        share_token: payload.share_token,
      })
    } catch (err) {
      // Release the claim so a Trigger.dev retry can attempt the send again.
      try {
        await redis.del(claimKey)
      } catch {
        // Redis unavailable: nothing to release.
      }
      throw err
    }

    return { sent: true, to: payload.to }
  },
})
