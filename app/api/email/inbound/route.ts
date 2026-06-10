import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'

const resend = new Resend(process.env.RESEND_API_KEY)

// Receives forwarded emails from the TM.
// The TM forwards a tech pack, hotel confirmation, or flight itinerary to
// advancing@{artist_slug}.reeve.me. Resend delivers it here via email.received webhook.
// Rule: verify Svix signature, fetch body from Resend API, store raw row, enqueue job, return 200 fast.
// The extraction job proposes rows; nothing is written to the spine until the TM confirms.
export async function POST(request: NextRequest) {
  const payload = await request.text()

  // Resend uses Svix for webhook signatures. Verify before touching the payload.
  // Throws if the signature is invalid or the timestamp is too old (replay protection).
  let event: Record<string, unknown>
  try {
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: request.headers.get('svix-id') ?? '',
        timestamp: request.headers.get('svix-timestamp') ?? '',
        signature: request.headers.get('svix-signature') ?? '',
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? '',
    }) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
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
  // advancing@{artist_slug}.reeve.me -> look up tour by artist_slug.
  const toAddress = toAddresses[0] ?? ''
  const slugMatch = toAddress.match(/advancing@([^.]+)\.reeve\.me/)
  const artistSlug = slugMatch?.[1]

  if (!artistSlug) {
    return NextResponse.json({ error: 'Unrecognised recipient' }, { status: 200 })
  }

  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('tours')
    .select('id')
    .eq('artist_slug', artistSlug)
    .single()

  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 200 })
  }

  // Webhook payloads contain metadata only. Fetch the body from Resend's API.
  // Prefer plain text for extraction; fall back to HTML if text is absent.
  let bodyText = ''
  try {
    const { data: received } = await resend.emails.receiving.get(emailId)
    bodyText = received?.text ?? received?.html ?? ''
  } catch (err) {
    // Log but continue: store the row with empty body so the TM can see the
    // extraction arrived, and let the job mark it failed gracefully.
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
