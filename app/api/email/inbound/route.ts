import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'

// Resend signs webhooks with Svix. The secret is base64-encoded with a
// "whsec_" prefix. The signed content is "{svix-id}.{svix-timestamp}.{body}".
// We also reject timestamps older than 5 minutes to block replay attacks.
// This implements the same algorithm as the Svix SDK without the dependency.
function verifySvixSignature(
  rawBody: string,
  msgId: string | null,
  msgTimestamp: string | null,
  msgSignature: string | null,
  secret: string
): boolean {
  if (!msgId || !msgTimestamp || !msgSignature) return false

  // Replay protection: reject if the timestamp is more than 5 minutes old.
  const ts = parseInt(msgTimestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false

  // Strip the "whsec_" prefix and base64-decode to get the raw key bytes.
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret
  const keyBytes = Buffer.from(rawSecret, 'base64')

  const signedContent = `${msgId}.${msgTimestamp}.${rawBody}`
  const expectedHmac = createHmac('sha256', keyBytes)
    .update(signedContent)
    .digest('base64')

  // svix-signature may contain multiple space-separated "v1,<sig>" tokens.
  const signatures = msgSignature.split(' ')
  for (const sig of signatures) {
    const [version, value] = sig.split(',')
    if (version !== 'v1' || !value) continue
    try {
      const a = Buffer.from(expectedHmac, 'base64')
      const b = Buffer.from(value, 'base64')
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    } catch {
      continue
    }
  }
  return false
}

// Fetches the plain-text body of a received email from the Resend REST API.
// The webhook payload contains metadata only; body requires a separate call.
async function fetchEmailBody(emailId: string): Promise<string> {
  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  })
  if (!res.ok) throw new Error(`Resend API ${res.status}`)
  const json = await res.json() as { text?: string | null; html?: string | null }
  return json.text ?? json.html ?? ''
}

// Receives forwarded emails from the TM.
// The TM forwards a tech pack, hotel confirmation, or flight itinerary to
// advancing@{artist_slug}.yourreeve.com. Resend delivers it here via email.received webhook.
// Rule: verify Svix signature, fetch body from Resend API, store raw row, enqueue job, return 200 fast.
// The extraction job proposes rows; nothing is written to the spine until the TM confirms.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 401 })
  }
  const valid = verifySvixSignature(
    rawBody,
    request.headers.get('svix-id'),
    request.headers.get('svix-timestamp'),
    request.headers.get('svix-signature'),
    secret
  )

  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Only handle inbound email events. Ignore delivery/bounce/open events
  // that may arrive if this endpoint is also used for outbound tracking.
  if (event.type !== 'email.received') {
    return NextResponse.json({ status: 'ignored' })
  }

  const data = event.data as Record<string, unknown>
  const emailId = data.email_id as string | undefined
  const toAddresses = (data.to as string[] | undefined) ?? []
  const fromAddress = (data.from as string | undefined) ?? null
  const subject = (data.subject as string | undefined) ?? null

  if (!emailId) {
    return NextResponse.json({ error: 'Missing email_id' }, { status: 200 })
  }

  // The recipient address tells us which tour this is for.
  // advancing@{artist_slug}.yourreeve.com -> look up artist by slug, then route to most recent active tour.
  const toAddress = toAddresses[0] ?? ''
  const slugMatch = toAddress.match(/advancing@([^.]+)\.yourreeve\.com/)
  const artistSlug = slugMatch?.[1]

  if (!artistSlug) {
    return NextResponse.json({ error: 'Unrecognised recipient' }, { status: 200 })
  }

  const admin = createAdminClient()

  // Look up the artist by slug.
  const { data: artistRow } = await admin
    .from('artists')
    .select('id')
    .eq('slug', artistSlug)
    .single()

  if (!artistRow) {
    return NextResponse.json({ error: 'Unrecognised recipient' }, { status: 200 })
  }

  // Route to the most recently created active tour for this artist.
  const { data: tour } = await admin
    .from('tours')
    .select('id')
    .eq('artist_id', artistRow.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 200 })
  }

  // Fetch body from Resend's receiving API. Prefer plain text for extraction.
  // Log and continue on failure: the row is stored with an empty body and the
  // extraction job will mark it failed, which the TM can see and discard.
  let bodyText = ''
  try {
    bodyText = await fetchEmailBody(emailId)
  } catch (err) {
    console.error('[email/inbound] failed to fetch received email body:', err)
  }

  // Store the raw email. The extraction job reads this row by ID and writes
  // proposed_rows back. proposed_rows stays null until extraction completes.
  const { data: forwarded, error: insertError } = await admin
    .from('forwarded_emails')
    .insert({
      tour_id: tour.id,
      from_address: fromAddress,
      subject,
      body_text: bodyText,
      attachments_json: [],
      extraction_status: 'pending',
    })
    .select('id')
    .single()

  if (insertError || !forwarded) {
    console.error('[email/inbound] failed to store forwarded email:', insertError)
    return NextResponse.json({ error: 'Storage failed' }, { status: 500 })
  }

  // Enqueue the Sonnet extraction job. Return 200 immediately.
  await tasks.trigger('extract-forward', {
    forwarded_email_id: forwarded.id,
  })

  return NextResponse.json({ status: 'ok' })
}
