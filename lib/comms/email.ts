import { randomBytes } from 'crypto'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'

const resend = new Resend(process.env.RESEND_API_KEY)

// Returns a URL-safe 32-character random token for document share links.
// Stored in document_shares.share_token. Never reuse or predict.
export function generateShareToken(): string {
  return randomBytes(24).toString('base64url')
}

// Pushes DNS records returned by Resend into Cloudflare.
// Uses the REST API directly to avoid adding a dependency.
// Skips records that already exist (Cloudflare returns 81057 on duplicate).
// Non-throwing: a failed DNS write is logged and the caller decides whether
// to surface it.
async function syncDnsToCloudflare(
  records: Array<{
    type: string
    name: string
    value: string
    ttl: string
    priority?: number
  }>
): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN
  const zoneId = process.env.CLOUDFLARE_ZONE_ID
  if (!token || !zoneId) {
    console.warn('[syncDnsToCloudflare] CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID not set, skipping DNS sync')
    return
  }

  for (const record of records) {
    const body: Record<string, unknown> = {
      type: record.type,
      name: record.name,
      // Cloudflare uses 'content' for the record value.
      content: record.value,
      ttl: parseInt(record.ttl, 10) || 3600,
      // Resend's DKIM/SPF records must not be proxied.
      proxied: false,
    }
    if (record.priority !== undefined) body.priority = record.priority

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    )

    const json = await res.json() as { success: boolean; errors: Array<{ code: number; message: string }> }

    if (!json.success) {
      const isDuplicate = json.errors.some((e) => e.code === 81057)
      if (!isDuplicate) {
        console.error(`[syncDnsToCloudflare] Failed to create ${record.type} record for ${record.name}:`, json.errors)
      }
      // Duplicate records are expected when the same artist slug is reused
      // across multiple tours. Silently skip.
    }
  }
}

// Provisions a Resend sending domain for a tour at creation time.
// The sending address for the tour becomes advancing@{slug}.yourreeve.com.
// If the domain already exists in Resend (artist has a prior tour with the
// same slug), the existing domain is reused and no DNS changes are needed.
// Logs errors but does not throw: a failed provision degrades to the fallback
// address gracefully rather than blocking tour creation.
export async function provisionTourEmailDomain(artistSlug: string): Promise<void> {
  const domain = `${artistSlug}.yourreeve.com`

  // Check whether the domain is already provisioned in Resend.
  // The list API returns all domains for the account.
  const { data: listData, error: listError } = await resend.domains.list()
  if (listError) {
    console.error(`[provisionTourEmailDomain] Failed to list domains:`, listError)
    return
  }

  const existing = listData?.data.find((d) => d.name === domain)
  if (existing) {
    // Domain already exists: nothing to provision or sync.
    return
  }

  const { data, error } = await resend.domains.create({ name: domain })
  if (error || !data) {
    console.error(`[provisionTourEmailDomain] Failed to create domain ${domain}:`, error)
    return
  }

  // Sync the initial sending DNS records (DKIM, SPF) to Cloudflare.
  await syncDnsToCloudflare(data.records)

  // Enable inbound receiving. The SDK types don't expose the capabilities
  // field yet, so we call the REST API directly.
  const enableRes = await fetch(`https://api.resend.com/domains/${data.id}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ capabilities: { receiving: 'enabled' } }),
  })

  if (!enableRes.ok) {
    console.error(`[provisionTourEmailDomain] Failed to enable receiving on ${domain}: ${enableRes.status}`)
  } else {
    // Fetch the full domain record now that receiving is enabled, Resend
    // will have added inbound MX records that also need to land in Cloudflare.
    const { data: fullDomain, error: getError } = await resend.domains.get(data.id)
    if (getError || !fullDomain) {
      console.error(`[provisionTourEmailDomain] Failed to fetch updated records for ${domain}:`, getError)
    } else {
      await syncDnsToCloudflare(fullDomain.records)
    }
  }

  // Trigger Resend's DNS verification check. This replaces the manual
  // "Verify DNS Records" button click in the dashboard.
  const { error: verifyError } = await resend.domains.verify(data.id)
  if (verifyError) {
    console.error(`[provisionTourEmailDomain] Verify call failed for ${domain}:`, verifyError)
  }
}

// Resolves the from address for a tour.
// localPart defaults to 'advancing' (formal documents); operational mail passes
// 'crew'. Falls back to the shared {localPart}@yourreeve.com when artist_slug is null.
export function tourFromAddress(
  artistSlug: string | null | undefined,
  localPart = 'advancing'
): string {
  if (!artistSlug) return `${localPart}@yourreeve.com`
  return `${localPart}@${artistSlug}.yourreeve.com`
}

export type EmailAttachment = {
  filename: string
  content: Buffer | string // raw Buffer or base64 string
}

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  // The artist slug determines the from domain: {local_part}@{slug}.yourreeve.com.
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
