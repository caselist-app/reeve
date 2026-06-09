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

  // Find the next upcoming show.
  const today = new Date().toISOString().split('T')[0]
  const { data: show } = await admin
    .from('shows')
    .select('id, venue_name, date, address, load_in_at')
    .eq('tour_id', tour_id)
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .single()

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
