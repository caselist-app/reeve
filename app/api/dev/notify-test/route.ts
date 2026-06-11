import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMorningMessageData } from '@/lib/comms/templates/morning-message'
import { notify } from '@/lib/comms/notify'
import { sendTemplate } from '@/lib/comms/whatsapp'
import { provisionTourEmailDomain } from '@/lib/comms/email'

// Diagnostic route: fire a real notification to one person so the channel
// plumbing can be verified end to end.
// Only available outside production. Guarded by CRON_SECRET in the header.
//
// POST /api/dev/notify-test
// Headers: x-cron-secret: <CRON_SECRET>
// Body (JSON): { email?, whatsapp?, person_id?, type?, force? }
//
// type  currently only morning_message
// force when true, clears prior notification_log rows so the send retries
//       (otherwise idempotency correctly skips an already-sent one)
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const headerSecret = request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || headerSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const personId = typeof body.person_id === 'string' ? body.person_id : null
  const email = typeof body.email === 'string' ? body.email : null
  const whatsapp = typeof body.whatsapp === 'string' ? body.whatsapp : null
  const type = typeof body.type === 'string' ? body.type : 'morning_message'
  const force = body.force === true

  // Raw template delivery: bypasses notify() and sends an approved template
  // straight to a number. Body: { template, to, lang? }
  const provisionSlug = typeof body.provision === 'string' ? body.provision : null
  if (provisionSlug) {
    try {
      await provisionTourEmailDomain(provisionSlug)
      return NextResponse.json({ ok: true, provisioned: `${provisionSlug}.yourreeve.com` })
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      )
    }
  }

  const templateName = typeof body.template === 'string' ? body.template : null
  if (templateName) {
    const to = typeof body.to === 'string' ? body.to : whatsapp
    if (!to) {
      return NextResponse.json({ error: 'template test requires body.to' }, { status: 400 })
    }
    const languageCode = typeof body.lang === 'string' ? body.lang : (templateName === 'hello_world' ? 'en_US' : 'en')
    try {
      const result = await sendTemplate({ to, templateName, languageCode })
      return NextResponse.json({ ok: true, sent_template: templateName, to, ...result })
    } catch (err) {
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      )
    }
  }

  if (type !== 'morning_message') {
    return NextResponse.json({ error: `unsupported type: ${type}` }, { status: 400 })
  }

  const admin = createAdminClient()

  // Resolve the person by explicit id, or via the email / whatsapp on a contact.
  let person: { id: string; tour_id: string } | null = null

  if (personId) {
    const { data } = await admin
      .from('people')
      .select('id, tour_id')
      .eq('id', personId)
      .single()
    person = data ?? null
  } else if (email || whatsapp) {
    const { data: contact } = email
      ? await admin.from('contacts').select('id').eq('contact_email', email).limit(1).maybeSingle()
      : await admin.from('contacts').select('id').eq('whatsapp_number', whatsapp!).limit(1).maybeSingle()

    if (contact) {
      // Most recent tour membership for this contact.
      const { data: rows } = await admin
        .from('people')
        .select('id, tour_id, created_at')
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
      person = rows?.[0] ? { id: rows[0].id, tour_id: rows[0].tour_id } : null
    }
  }

  if (!person) {
    return NextResponse.json(
      { error: 'recipient not found: pass person_id, or email / whatsapp matching a roster contact who is on a tour' },
      { status: 404 }
    )
  }

  const { data: tour } = await admin
    .from('tours')
    .select('timezone')
    .eq('id', person.tour_id)
    .single()

  const timezone = tour?.timezone ?? 'UTC'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())

  // Prefer the next upcoming show on the tour; fall back to the most recent.
  const { data: upcoming } = await admin
    .from('shows')
    .select('id, date')
    .eq('tour_id', person.tour_id)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data: show } =
    upcoming
      ? { data: upcoming }
      : await admin
          .from('shows')
          .select('id, date')
          .eq('tour_id', person.tour_id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()

  if (!show) {
    return NextResponse.json({ error: 'no show on this tour to base a morning message on' }, { status: 404 })
  }

  if (force) {
    await admin
      .from('notification_log')
      .delete()
      .match({
        tour_id: person.tour_id,
        person_id: person.id,
        notification_type: 'morning_message',
        dedup_dimension: show.date,
      })
  }

  const data = await buildMorningMessageData(person.id, show.id, timezone)
  if (!data) {
    return NextResponse.json({ error: 'could not build morning message data' }, { status: 500 })
  }

  const result = await notify({
    tourId: person.tour_id,
    personId: person.id,
    type: 'morning_message',
    data,
    dedupDimension: show.date,
  })

  return NextResponse.json({ show_date: show.date, ...result })
}
