import { createAdminClient } from '@/lib/supabase/admin'

// /crew slash command. Zero-AI template render.
// Returns the crew list for the tour with roles and WhatsApp numbers.

export async function renderCrew(tour_id: string): Promise<string> {
  const admin = createAdminClient()

  const { data: people } = await admin
    .from('people')
    .select('name, role, person_type, whatsapp_number, contact_phone')
    .eq('tour_id', tour_id)
    .order('person_type', { ascending: true })
    .order('name', { ascending: true })

  if (!people || people.length === 0) return 'No crew on this tour yet.'

  const grouped: Record<string, string[]> = {}

  for (const person of people) {
    const type = person.person_type.charAt(0).toUpperCase() + person.person_type.slice(1)
    if (!grouped[type]) grouped[type] = []
    const contact = person.whatsapp_number ?? person.contact_phone ?? ''
    const line = `${person.name}${person.role ? ' - ' + person.role : ''}${contact ? ' (' + contact + ')' : ''}`
    grouped[type].push(line)
  }

  const lines: string[] = []
  for (const [type, members] of Object.entries(grouped)) {
    lines.push(`*${type}*`)
    lines.push(...members)
    lines.push('')
  }

  return lines.join('\n').trim()
}
