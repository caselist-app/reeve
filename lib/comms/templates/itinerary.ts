import { createAdminClient } from '@/lib/supabase/admin'

// /itinerary slash command. Zero-AI template render.
// Returns the full day sheet for the next (or current) show.

function formatTime(iso: string | null): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  })
}

function formatDateTime(iso: string | null): string {
  if (!iso) return 'TBC'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} ${formatTime(iso)}`
}

export async function renderItinerary(
  person_id: string,
  tour_id: string
): Promise<string> {
  const admin = createAdminClient()

  // Find the active or next upcoming show.
  //
  // A show that runs past midnight is still the "active" show until curfew_at
  // passes. Example: show date 14 Jun, curfew_at 03:00 on 15 Jun. A crew
  // member messaging at 01:00 on 15 Jun should still see 14 Jun's show.
  //
  // Query: pick the first show where curfew_at is in the future (show still
  // running), or where curfew_at is null and the show date is today or later
  // (no curfew recorded, fall back to calendar day). Order by date so the
  // nearest show wins.
  const now = new Date().toISOString()
  const today = now.split('T')[0]

  const { data: shows } = await admin
    .from('shows')
    .select('id, venue_name, date, address, load_in_at, curfew_at')
    .eq('tour_id', tour_id)
    .or(`curfew_at.gt.${now},and(curfew_at.is.null,date.gte.${today})`)
    .order('date', { ascending: true })
    .limit(1)

  const show = shows?.[0]

  if (!show) return 'No upcoming shows on this tour.'

  const { data: daySheet } = await admin
    .from('day_sheets')
    .select('*')
    .eq('show_id', show.id)
    .single()

  const lines: string[] = [
    `*${show.venue_name}*`,
    show.address ?? '',
    ``,
    `Venue access: ${formatDateTime(daySheet?.venue_access ?? null)}`,
    `Load in: ${formatTime(daySheet?.load_in ?? null)}`,
    `Line check: ${formatTime(daySheet?.line_check ?? null)}`,
    `Soundcheck: ${formatTime(daySheet?.soundcheck ?? null)}`,
    `Doors: ${formatTime(daySheet?.doors ?? null)}`,
    `Support on: ${formatTime(daySheet?.support_on ?? null)}`,
    `Headliner on: ${formatTime(daySheet?.headliner_on ?? null)}`,
    `Curfew: ${formatTime(daySheet?.curfew ?? null)}`,
    `Load out: ${formatTime(daySheet?.load_out ?? null)}`,
  ].filter(Boolean)

  return lines.join('\n')
}
