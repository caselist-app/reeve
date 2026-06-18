import type { createClient } from '@/lib/supabase/server'

type Client = Awaited<ReturnType<typeof createClient>>

export interface RosterPerson {
  id: string
  name: string
  person_type: string
}

// A day's roster is the people assigned to its tour_date-linked transport or
// hotels. The segment and hotel ids come from fetchDayRecords, so the two
// assignment queries run in parallel rather than each blocking on its own id
// lookup first. Resolved once in DayContent and shared by the info panel and
// the mobile bottom dock so neither re-queries.
export async function fetchDayRoster(
  supabase: Client,
  { tourId, segmentIds, hotelStayIds }: { tourId: string; segmentIds: string[]; hotelStayIds: string[] },
): Promise<RosterPerson[]> {
  const [{ data: transportPeople }, { data: hotelPeople }] = await Promise.all([
    supabase
      .from('transport_assignments')
      .select('people(id, name, person_type)')
      .eq('tour_id', tourId)
      .in('segment_id', segmentIds),
    supabase
      .from('room_assignments')
      .select('people(id, name, person_type)')
      .eq('tour_id', tourId)
      .in('hotel_stay_id', hotelStayIds),
  ])

  const rosterMap = new Map<string, RosterPerson>()
  for (const row of [...(transportPeople ?? []), ...(hotelPeople ?? [])]) {
    const p = Array.isArray(row.people) ? row.people[0] : row.people
    if (p && !rosterMap.has(p.id)) {
      rosterMap.set(p.id, { id: p.id, name: p.name, person_type: p.person_type })
    }
  }
  return Array.from(rosterMap.values())
}
