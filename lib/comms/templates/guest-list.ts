import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTimezone } from '@/lib/schedule/datetime'
import { resolveNextShow, formatShowDate } from '@/lib/comms/guest-request'

// /guestlist slash command. Zero-AI template render, the same shape as /crew.
// Brief 52, step 6 (REE-133).
//
// It renders the requester's OWN names for the next show, approved and waiting,
// and nothing else: a crew member has no business reading the whole list. The
// counts a TM sees, and everyone else's names, live in the panel.

export async function renderGuestList(person_id: string, tour_id: string): Promise<string> {
  const admin = createAdminClient()

  const { data: tour } = await admin
    .from('tours')
    .select('timezone')
    .eq('id', tour_id)
    .maybeSingle()
  // No show is known yet at this point (the next show is what this call is about
  // to resolve), so there is no per-record zone to prefer here. Still routed
  // through resolveTimezone, the one shared authority for "which zone", rather
  // than a second ad hoc `?? 'UTC'` growing beside it.
  const tz = resolveTimezone({ timezone: null }, tour?.timezone ?? null)

  const show = await resolveNextShow(admin, tour_id, tz)
  if (!show) return 'No upcoming show on this tour yet.'

  const { data: rows, error } = await admin
    .from('guest_list_entries')
    .select('first_name, last_name, num_tickets, status')
    .eq('show_id', show.id)
    .eq('requested_by_person_id', person_id)
    .in('status', ['requested', 'approved'])
    .order('created_at', { ascending: true })

  // A failed read must not render as an empty list. "No names" is a confident,
  // plausible, wrong answer, and a crew member would act on it. Same rule as the
  // other four templates: log it, say we could not load it.
  if (error) {
    console.error('[guestlist] entries lookup failed:', error.message, { tour_id, person_id })
    return 'Could not load your guest list just now. Try again in a moment.'
  }

  const named = (rows ?? []).map((r) => ({
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'A guest',
    tickets: r.num_tickets ?? 1,
    status: r.status,
  }))

  const approved = named.filter((r) => r.status === 'approved')
  const waiting = named.filter((r) => r.status === 'requested')

  const header = `*${show.venue_name ?? 'Next show'}, ${formatShowDate(show.date)}*`

  if (approved.length === 0 && waiting.length === 0) {
    return `${header}\nYou have no names on the list yet.`
  }

  const lines: string[] = [header]

  if (approved.length > 0) {
    lines.push('', 'On the list:')
    for (const r of approved) lines.push(`- ${r.name}, ${ticketPhrase(r.tickets)}`)
  }

  if (waiting.length > 0) {
    lines.push('', 'Waiting:')
    for (const r of waiting) lines.push(`- ${r.name}, ${ticketPhrase(r.tickets)}`)
  }

  return lines.join('\n')
}

function ticketPhrase(n: number): string {
  return `${n} ${n === 1 ? 'ticket' : 'tickets'}`
}
