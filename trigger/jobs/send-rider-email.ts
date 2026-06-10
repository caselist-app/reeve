import { task } from '@trigger.dev/sdk/v3'
import { sendEmail } from '@/lib/comms/email'
import { renderRiderEmail } from '@/lib/comms/templates/rider-email'

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
export const sendRiderEmailJob = task({
  id: 'send-rider-email',
  run: async (payload: RiderEmailPayload) => {
    const html = renderRiderEmail({
      recipientName: payload.recipient_name,
      artistName: payload.artist_name,
      documentTitle: payload.document_title,
      note: payload.note,
      shareUrl: payload.share_url,
    })

    await sendEmail({
      to: payload.to,
      subject: `${payload.document_title} — ${payload.artist_name}`,
      html,
      artist_slug: payload.artist_slug,
      share_token: payload.share_token,
    })

    return { sent: true, to: payload.to }
  },
})
