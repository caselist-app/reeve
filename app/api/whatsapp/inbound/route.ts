import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { tasks } from '@trigger.dev/sdk/v3'

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

  // Verify Meta signature using the App Secret.
  // WHATSAPP_APP_SECRET is the Meta App's app secret (not the verify token).
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (appSecret) {
    const signature = request.headers.get('x-hub-signature-256')
    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
    if (signature !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
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

          // Update the broadcast_log row that matches this wamid.
          // Admin client bypasses RLS - this handler runs as the system, not a user.
          await admin
            .from('broadcast_log')
            .update(update)
            .eq('wamid', wamid)
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
        if (!fromNumber || !body) continue

        // Map the sender number to a person across the TM's tours. The number
        // lives on the contact; a number maps to at most one person per tour
        // (enforced by trigger), but could appear on two tours. Pick the most
        // recently created tour so the person gets the active tour context.
        const { data: people } = await admin
          .from('people')
          .select('id, tour_id, tours!inner(created_at), contacts!inner(whatsapp_number)')
          .eq('contacts.whatsapp_number', fromNumber)
          .order('tours.created_at', { ascending: false })
          .limit(1)

        const person = people?.[0]
        if (!person) continue  // Unknown number - no tour context, drop silently.

        // Enqueue the router job. The handler does nothing else.
        await tasks.trigger('whatsapp-router', {
          tour_id: person.tour_id,
          person_id: person.id,
          from_number: fromNumber,
          body,
        })
      }
    }
  }

  // Always return 200 fast. Meta retries on anything else.
  return NextResponse.json({ status: 'ok' })
}
