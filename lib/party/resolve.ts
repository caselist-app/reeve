import type { SupabaseClient } from '@supabase/supabase-js'

// The one place that answers "who is attached to this". Before this, the same
// transport_assignments / room_assignments query was hand-rolled in six
// places (lib/comms/affected.ts, lib/schedule/day-roster.ts among them), each
// with its own selection of fields and its own tour-scoping. Brief 35.
export type PartyEntity =
  | { kind: 'transport_segment'; ids: string[] }
  | { kind: 'hotel_stay'; ids: string[] }

export interface PartyPerson {
  id: string
  name: string
  person_type: string
  whatsapp_number: string | null
  contact_email: string | null
}

// A failed read must never render as an empty result (CLAUDE.md): a null
// error is a trustworthy (possibly empty) list, a non-null error is a list
// that could not be built.
export interface PartyResult {
  people: PartyPerson[]
  error: string | null
}

// Resolves the people attached to one or more transport_segment or
// hotel_stay rows. Scoped by tour_id on the assignment row itself, not just
// on the entity: an id from another tour, passed in by mistake, matches
// nothing rather than leaking that tour's roster (CLAUDE.md, "RLS does not
// check that two ids in the same payload belong to the same tour").
export async function resolveParty(
  supabase: SupabaseClient,
  tourId: string,
  entity: PartyEntity
): Promise<PartyResult> {
  if (entity.ids.length === 0) return { people: [], error: null }

  const { data, error } =
    entity.kind === 'transport_segment'
      ? await supabase
          .from('transport_assignments')
          .select('people(id, person_type, contacts(name, whatsapp_number, contact_email))')
          .eq('tour_id', tourId)
          .in('segment_id', entity.ids)
      : await supabase
          .from('room_assignments')
          .select('people(id, person_type, contacts(name, whatsapp_number, contact_email))')
          .eq('tour_id', tourId)
          .in('hotel_stay_id', entity.ids)

  if (error) return { people: [], error: error.message }

  return { people: dedupe(extractPeople(data)), error: null }
}

type RawContact = {
  name: string | null
  whatsapp_number: string | null
  contact_email: string | null
} | null

type RawPerson = {
  id: string
  person_type: string
  contacts: RawContact | RawContact[]
} | null

// Identity lives on the contact. PostgREST embeds a to-one relationship as an
// object in the common case, but returns an array when it cannot prove the
// relationship is unique, so both shapes are unwrapped defensively rather
// than assumed.
function extractPeople(data: Array<{ people: RawPerson | RawPerson[] }> | null): PartyPerson[] {
  if (!data) return []
  const people: PartyPerson[] = []
  for (const row of data) {
    const p = Array.isArray(row.people) ? row.people[0] : row.people
    if (!p) continue
    const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts
    people.push({
      id: p.id,
      person_type: p.person_type,
      name: contact?.name ?? '',
      whatsapp_number: contact?.whatsapp_number ?? null,
      contact_email: contact?.contact_email ?? null,
    })
  }
  return people
}

function dedupe(people: PartyPerson[]): PartyPerson[] {
  const seen = new Set<string>()
  return people.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}
