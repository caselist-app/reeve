import { createAdminClient } from '@/lib/supabase/admin'

// /crew slash command. Zero-AI template render.
// Returns the crew list for the tour with roles and WhatsApp numbers.

export async function renderCrew(tour_id: string): Promise<string> {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('people')
    .select('role, person_type, contacts(name, whatsapp_number, contact_phone)')
    .eq('tour_id', tour_id)

  if (!rows || rows.length === 0) return 'No crew on this tour yet.'

  // Identity lives on the contact. Flatten it, then order by type then name.
  const people = rows
    .map((r) => {
      const c = r.contacts as {
        name: string
        whatsapp_number: string | null
        contact_phone: string | null
      } | null
      return {
        person_type: r.person_type,
        role: r.role,
        name: c?.name ?? '',
        whatsapp_number: c?.whatsapp_number ?? null,
        contact_phone: c?.contact_phone ?? null,
      }
    })
    .sort((a, b) => a.person_type.localeCompare(b.person_type) || a.name.localeCompare(b.name))

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
