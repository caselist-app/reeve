import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildMorningMessageData } from '@/lib/comms/templates/morning-message'
import { notify } from '@/lib/comms/notify'

// Diagnostic route: fire a real notification to one person so the channel
// plumbing can be verified end to end. Guarded by CRON_SECRET. Not user-facing.
//
//   GET /api/dev/notify-test?secret=...&email=you@x.com&force=1
//   GET /api/dev/notify-test?secret=...&whatsapp=+447700900123&force=1
//   GET /api/dev/notify-test?secret=...&person_id=...&force=1
//
// Identify the recipient by person_id, or by the email / whatsapp number on
// their roster contact (whichever is easier). The channel that actually fires
// is resolved from that contact's preferred_channel.
//
// type   currently only morning_message
// force  when 1, clears prior notification_log rows for this send so it
//        re-sends (otherwise idempotency correctly skips an already-sent one)
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const secret = params.get('secret')

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const personId = params.get('person_id')
  const email = params.get('email')
  const whatsapp = params.get('whatsapp')
  const type = params.get('type') ?? 'morning_message'
  const force = params.get('force') === '1'

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
