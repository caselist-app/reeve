import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

// ChangeDescriptor identifies the record that changed.
// Used by getAffectedPeople and buildChangeMessage to compute
// who to notify and what message to generate.
export type ChangeDescriptor =
  | { type: 'transport_segment'; segmentId: string }
  | { type: 'hotel_stay'; stayId: string }
  | { type: 'show'; showId: string; field: 'load_in_at' | 'address' | 'curfew_at' }
  | { type: 'day_sheet'; showId: string }

export type AffectedPerson = {
  id: string
  name: string
  whatsapp_number: string | null
}

// Returns the people who should receive a notification for this change.
// Each case is deliberately narrow: only directly-assigned people are notified
// for transport and hotel changes. Day sheet changes go to everyone contactable.
export async function getAffectedPeople(
  change: ChangeDescriptor,
  tourId: string,
  supabase?: SupabaseClient
): Promise<AffectedPerson[]> {
  const db = supabase ?? (await createClient())

  switch (change.type) {
    case 'transport_segment': {
      const { data } = await db
        .from('transport_assignments')
        .select('people(id, contacts(name, whatsapp_number))')
        .eq('segment_id', change.segmentId)
        .eq('tour_id', tourId)

      return extractPeople(data)
    }

    case 'hotel_stay': {
      const { data } = await db
        .from('room_assignments')
        .select('people(id, contacts(name, whatsapp_number))')
        .eq('hotel_stay_id', change.stayId)
        .eq('tour_id', tourId)

      return extractPeople(data)
    }

    case 'show': {
      // Show changes (load-in, address, curfew) affect:
      // - People traveling on that show's date (segment departs or arrives that day)
      // - People in a hotel that checks in on that show's date
      const { data: show } = await db
        .from('shows')
        .select('date')
        .eq('id', change.showId)
        .single()

      if (!show) return []

      const showDate = show.date
      // UTC window for the show date. Using date-prefix slicing avoids timezone
      // drift in the common case (tours are rarely UTC-12 or UTC+14).
      const dayStart = `${showDate}T00:00:00.000Z`
      const nextDay = incrementDate(showDate)
      const dayEnd = `${nextDay}T00:00:00.000Z`

      // Segments departing on the show date.
      const { data: departingSegs } = await db
        .from('transport_segments')
        .select('id')
        .eq('tour_id', tourId)
        .gte('depart_at', dayStart)
        .lt('depart_at', dayEnd)

      // Segments arriving on the show date (e.g. overnight bus).
      const { data: arrivingSegs } = await db
        .from('transport_segments')
        .select('id')
        .eq('tour_id', tourId)
        .gte('arrive_at', dayStart)
        .lt('arrive_at', dayEnd)

      const segIds = [
        ...(departingSegs ?? []).map((s) => s.id),
        ...(arrivingSegs ?? []).map((s) => s.id),
      ]

      // Hotels checking in on the show date.
      const { data: stays } = await db
        .from('hotel_stays')
        .select('id')
        .eq('tour_id', tourId)
        .eq('check_in_date', showDate)

      const stayIds = (stays ?? []).map((s) => s.id)

      const [segPeople, hotelPeople] = await Promise.all([
        segIds.length > 0
          ? db
              .from('transport_assignments')
              .select('people(id, contacts(name, whatsapp_number))')
              .eq('tour_id', tourId)
              .in('segment_id', segIds)
              .then((r) => extractPeople(r.data))
          : Promise.resolve([]),
        stayIds.length > 0
          ? db
              .from('room_assignments')
              .select('people(id, contacts(name, whatsapp_number))')
              .eq('tour_id', tourId)
              .in('hotel_stay_id', stayIds)
              .then((r) => extractPeople(r.data))
          : Promise.resolve([]),
      ])

      return deduplicate([...segPeople, ...hotelPeople])
    }

    case 'day_sheet': {
      // Day sheet changes affect everyone traveling with the tour who has
      // a contact channel. Not limited to people assigned to specific segments.
      const { data } = await db
        .from('people')
        .select('id, contacts!inner(name, whatsapp_number)')
        .eq('tour_id', tourId)
        .not('contacts.whatsapp_number', 'is', null)

      return (data ?? []).map((row) => {
        // To-one embed: object at runtime (Supabase types it loosely under !inner).
        const c = row.contacts as unknown as { name: string; whatsapp_number: string | null } | null
        return { id: row.id, name: c?.name ?? '', whatsapp_number: c?.whatsapp_number ?? null }
      })
    }
  }
}

// Safely extracts AffectedPerson[] from a joined Supabase result. Identity
// (name, number) lives on the contact, so each person row nests a contact.
function extractPeople(
  data: Array<{ people: unknown }> | null
): AffectedPerson[] {
  if (!data) return []
  return data
    .map((row) => {
      const p = row.people as {
        id?: string
        contacts?: { name?: string; whatsapp_number?: string | null } | null
      } | null
      if (!p || typeof p.id !== 'string') return null
      return {
        id: p.id,
        name: p.contacts?.name ?? '',
        whatsapp_number: p.contacts?.whatsapp_number ?? null,
      }
    })
    .filter((p): p is AffectedPerson => p !== null)
}

function deduplicate(people: AffectedPerson[]): AffectedPerson[] {
  const seen = new Set<string>()
  return people.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
}

// Adds one calendar day to a YYYY-MM-DD string without Date arithmetic
// to avoid timezone edge cases.
function incrementDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
