import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

// Returns a URL-safe 32-character random token for document share links.
// Stored in document_shares.share_token. Never reuse or predict.
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url')
}

// Provisions a Resend sending domain for a tour at creation time.
// The sending address for the tour becomes advancing@{slug}.reeve.me.
// Reeve controls reeve.me, so no TM DNS action is needed.
// Logs the error but does not throw: a missing domain degrades to the
// fallback address gracefully rather than blocking tour creation.
export async function provisionTourEmailDomain(artistSlug: string): Promise<void> {
  const domain = `${artistSlug}.reeve.me`
  try {
    await resend.domains.create({ name: domain })
  } catch (err) {
    console.error(`[provisionTourEmailDomain] Failed to provision ${domain}:`, err)
  }
}

// Resolves the from address for a tour.
// localPart defaults to 'advancing' (formal documents); operational mail passes
// 'crew'. Falls back to the shared {localPart}@reeve.me when artist_slug is null.
export function tourFromAddress(
  artistSlug: string | null | undefined,
  localPart = 'advancing'
): string {
  if (!artistSlug) return `${localPart}@reeve.me`
  return `${localPart}@${artistSlug}.reeve.me`
}

export type EmailAttachment = {
  filename: string
  content: Buffer | string // raw Buffer or base64 string
}

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  // The artist slug determines the from domain: {local_part}@{slug}.reeve.me.
  // Provisioned in Resend at tour creation.
  artist_slug: string | null | undefined
  // From local-part. Defaults to 'advancing' (formal document stream).
  // Operational notifications pass 'crew' so the two streams keep separate
  // sending reputations on the same branded subdomain.
  from_local_part?: string
  attachments?: EmailAttachment[]
  // When provided, sent_at is written to document_shares for this token.
  share_token?: string
}

// Returns the Resend message id so callers (e.g. the notifications service) can
// record it for delivery tracking.
export async function sendEmail(params: SendEmailParams): Promise<{ id: string | null }> {
  const from = tourFromAddress(params.artist_slug, params.from_local_part)

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    attachments: params.attachments,
  })

  if (error) throw new Error(`Resend error: ${error.message}`)

  // Write sent_at to the document_shares ledger.
  // The share page and acknowledge API write opened_at and acknowledged_at
  // separately via the admin client, not here.
  if (params.share_token) {
    const admin = createAdminClient()
    await admin
      .from('document_shares')
      .update({ sent_at: new Date().toISOString() })
      .eq('share_token', params.share_token)
  }

  return { id: data?.id ?? null }
}
