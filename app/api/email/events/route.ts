import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

// Resend uses Svix for webhook signatures.
// Headers: svix-id, svix-timestamp, svix-signature (v1,<base64_hmac>)
function verifyResendSignature(
  rawBody: string,
  headers: Headers
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return false

  const svixId = headers.get('svix-id')
  const svixTimestamp = headers.get('svix-timestamp')
  const svixSignature = headers.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) return false

  // Reject messages older than 5 minutes to prevent replay attacks.
  const timestamp = parseInt(svixTimestamp, 10)
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const toSign = `${svixId}.${svixTimestamp}.${rawBody}`
  // Svix secrets are prefixed with "whsec_" and base64-encoded.
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const computed = createHmac('sha256', secretBytes).update(toSign).digest('base64')
  const expected = `v1,${computed}`

  // svix-signature may contain multiple space-separated signatures.
  const provided = svixSignature.split(' ')
  return provided.some((sig) => {
    try {
      return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    } catch {
      return false
    }
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  if (!verifyResendSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: Record<string, unknown>
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const admin = createAdminClient()
  const type = event.type as string

  // Resend event types that matter: email.opened, email.clicked (= acknowledge).
  // The share_token is embedded in tracked link URLs as /a/{token}.
  if (type === 'email.opened') {
    const data = event.data as Record<string, unknown>
    const headers = data?.headers as Array<Record<string, string>> | undefined
    const shareToken = extractShareToken(headers, data)
    if (shareToken) {
      await admin
        .from('document_shares')
        .update({ opened_at: new Date().toISOString() })
        .eq('share_token', shareToken)
        .is('opened_at', null)  // Only set once.
    }
  }

  if (type === 'email.link_clicked') {
    const data = event.data as Record<string, unknown>
    const clickData = data?.click as Record<string, unknown> | undefined
    const clickedUrl = clickData?.link as string | undefined
    if (clickedUrl?.includes('/acknowledge/')) {
      const shareToken = clickedUrl.split('/acknowledge/')[1]?.split(/[?#]/)[0]
      if (shareToken) {
        await handleAcknowledgement(admin, shareToken)
      }
    }
  }

  return NextResponse.json({ status: 'ok' })
}

function extractShareToken(
  headers: Array<Record<string, string>> | undefined,
  data: Record<string, unknown>
): string | null {
  // The share token is the last path segment of the tracked link in our system.
  const url = (data?.click as Record<string, string> | undefined)?.link
    ?? (headers?.find((h) => h.name === 'X-Share-Token')?.value)
  if (!url) return null
  const match = url.match(/\/a\/([a-zA-Z0-9_-]+)/)
  return match?.[1] ?? null
}

async function handleAcknowledgement(
  admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>,
  shareToken: string
): Promise<void> {
  const now = new Date().toISOString()

  const { data: share } = await admin
    .from('document_shares')
    .update({ acknowledged_at: now, opened_at: now })
    .eq('share_token', shareToken)
    .is('acknowledged_at', null)
    .select('document_id, tour_id, documents(doc_type)')
    .single()

  if (!share) return

  // Nudge the relevant show_advance department toward done.
  // doc_type maps to a department: tech_rider->audio, hospitality_rider->hospitality, etc.
  const doc = share.documents as { doc_type: string } | null
  if (!doc) return

  const departmentMap: Record<string, string> = {
    tech_rider: 'status_audio',
    lighting_rider: 'status_lighting',
    staging_rider: 'status_staging',
    hospitality_rider: 'status_hospitality',
    travel_brief: 'status_travel',
  }

  type AdvanceColumn = 'status_audio' | 'status_lighting' | 'status_staging' | 'status_hospitality' | 'status_travel'
  const column = departmentMap[doc.doc_type] as AdvanceColumn | undefined
  if (!column) return

  // Build a typed update object. The computed key is narrowed to AdvanceColumn
  // which matches the show_advance update shape.
  type AdvanceUpdate = { [K in AdvanceColumn]?: string }
  const updatePayload: AdvanceUpdate = { [column]: 'in_progress' }

  await admin
    .from('show_advance')
    .update(updatePayload)
    .eq('tour_id', share.tour_id)
    .eq(column, 'not_started')
}
