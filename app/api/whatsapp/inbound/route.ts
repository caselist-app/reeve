import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'
import { redis } from '@/lib/redis'

// GET: Meta webhook verification handshake.
// Meta sends this when you first register the webhook URL.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mode = params.get('hub.mode')
  const token = params.get('hub.verify_token')
  const challenge = params.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// POST: inbound messages from WhatsApp users.
// Rule: verify signature, map number to person, enqueue, return 200.
// Nothing else happens in this handler.
export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  // Verify Meta signature using the App Secret. Fail closed if the secret is unset.
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 401 })
  }
  const signature = request.headers.get('x-hub-signature-256') ?? ''
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
  const sigBuf = Buffer.from(signature, 'utf8')
  const expBuf = Buffer.from(expected, 'utf8')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Extract messages from the Meta webhook envelope.
  const entry = (payload as Record<string, unknown>).entry
  if (!Array.isArray(entry)) {
    return NextResponse.json({ status: 'ok' })
  }

  const admin = createAdminClient()

  for (const e of entry) {
    const changes = (e as Record<string, unknown>).changes
    if (!Array.isArray(changes)) continue

    for (const change of changes) {
      const value = (change as Record<string, unknown>).value as Record<string, unknown>

      // Handle delivery/read receipts from Meta.
      // Meta sends statuses alongside (or instead of) messages in the same envelope.
      // Each status entry has: id (wamid), status ('sent'|'delivered'|'read'), timestamp.
      const statuses = value?.statuses
      if (Array.isArray(statuses)) {
        for (const s of statuses) {
          const status = s as Record<string, unknown>
          const wamid = status.id as string | undefined
          const statusType = status.status as string | undefined

          if (!wamid || (statusType !== 'delivered' && statusType !== 'read')) continue

          const now = new Date().toISOString()
          const update =
            statusType === 'delivered'
              ? { delivered_at: now }
              : { read_at: now }

          // Update the notification_log row whose provider_message_id matches
          // the wamid. The .is() guard prevents overwriting an already-set
          // timestamp if Meta re-delivers the same status event.
          // Admin client bypasses RLS - this handler runs as the system, not a user.
          await admin
            .from('notification_log')
            .update(update)
            .eq('provider_message_id', wamid)
            .is(statusType === 'delivered' ? 'delivered_at' : 'read_at', null)
        }
      }

      const messages = value?.messages
      if (!Array.isArray(messages)) continue

      for (const msg of messages) {
        const message = msg as Record<string, unknown>

        // Extract body from text or interactive (quick-reply button tap) messages.
        // Button taps arrive as type 'interactive' with the reply title as the body.
        let body: string | undefined
        if (message.type === 'text') {
          body = (message.text as Record<string, string>)?.body
        } else if (message.type === 'interactive') {
          const interactive = message.interactive as Record<string, unknown> | undefined
          body = (interactive?.button_reply as Record<string, string> | undefined)?.title
        }

        const fromNumber = message.from as string
        const wamid = message.id as string | undefined
        if (!fromNumber || !body) continue

        // Deduplicate on the Meta message id (wamid) before enqueuing.
        // Meta redelivers when it does not get a fast 200; SET NX is atomic.
        // If Redis is down, proceed: dropping an inbound message is worse than
        // a duplicate job enqueue (the router job has its own second guard).
        if (wamid) {
          try {
            const claimed = await redis.set(`wamid:${wamid}`, '1', { nx: true, ex: 60 * 60 * 24 })
            if (claimed === null) continue // Already processed this wamid.
          } catch {
            // Redis unavailable: proceed and rely on the router-job guard.
          }
        }

        // Map the sender number to a person across the TM's active tours. The
        // number lives on the contact; a number maps to at most one person per
        // tour (enforced by unique index), but the same contact can be on
        // multiple tours (as crew on two separate legs, for example).
        // Fetch all matches and select the best one in code: an active or
        // planning tour beats completed or archived. Within the same status,
        // prefer the most recently created tour.
        const { data: people } = await admin
          .from('people')
          .select('id, tour_id, tours!inner(id, status, created_at), contacts!inner(whatsapp_number)')
          .eq('contacts.whatsapp_number', fromNumber)

        if (!people || people.length === 0) continue  // Unknown number.

        // Sort: active > planning > completed > archived, then newest first.
        const STATUS_ORDER: Record<string, number> = {
          active: 0,
          planning: 1,
          completed: 2,
          archived: 3,
        }

        const sorted = [...people].sort((a, b) => {
          const ta = a.tours as { status: string; created_at: string } | null
          const tb = b.tours as { status: string; created_at: string } | null
          const sa = STATUS_ORDER[ta?.status ?? 'archived'] ?? 3
          const sb = STATUS_ORDER[tb?.status ?? 'archived'] ?? 3
          if (sa !== sb) return sa - sb
          return new Date(tb?.created_at ?? 0).getTime() - new Date(ta?.created_at ?? 0).getTime()
        })

        const person = sorted[0]
        if (!person) continue  // Should not happen given length check above.

        // Enqueue the router job. The handler does nothing else.
        await tasks.trigger('whatsapp-router', {
          tour_id: person.tour_id,
          person_id: person.id,
          from_number: fromNumber,
          body,
          wamid: wamid ?? null,
        })
      }
    }
  }

  // Always return 200 fast. Meta retries on anything else.
  return NextResponse.json({ status: 'ok' })
}
