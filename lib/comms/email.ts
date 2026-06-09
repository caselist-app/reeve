import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  // The artist slug determines the from address: advancing@{slug}.reeve.me
  // This is provisioned in Resend at tour creation.
  artist_slug: string
  // When provided, sent_at is written to document_shares for this token.
  share_token?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const from = `advancing@${params.artist_slug}.reeve.me`

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)

  // Write sent_at to the document_shares ledger.
  // The Resend open/acknowledge webhook writes opened_at and acknowledged_at
  // separately via the service role handler.
  if (params.share_token) {
    const admin = createAdminClient()
    await admin
      .from('document_shares')
      .update({ sent_at: new Date().toISOString() })
      .eq('share_token', params.share_token)
  }
}
