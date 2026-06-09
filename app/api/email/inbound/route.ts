import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'

// Receives forwarded emails from the TM.
// The TM forwards a tech pack, hotel confirmation, or flight itinerary to
// advancing@{artist_slug}.reeve.me. Resend delivers it here.
// Rule: store raw, enqueue extraction job, return 200 fast.
// The extraction job proposes rows; nothing is written to the spine here.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // The recipient address tells us which tour this is for.
  // advancing@{artist_slug}.reeve.me -> look up tour by artist_slug.
  const to = (body.to as string | undefined) ?? ''
  const slugMatch = to.match(/advancing@([^.]+)\.reeve\.me/)
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

  // Reconstruct a readable plain-text version of the email for extraction.
  const rawEmail = [
    `From: ${body.from ?? ''}`,
    `To: ${to}`,
    `Subject: ${body.subject ?? ''}`,
    ``,
    body.text ?? body.html ?? '',
  ].join('\n')

  // Enqueue the Sonnet extraction job. The TM reviews the proposal in the UI.
  await tasks.trigger('extract-forward', {
    tour_id: tour.id,
    raw_email: rawEmail,
  })

  return NextResponse.json({ status: 'ok' })
}
