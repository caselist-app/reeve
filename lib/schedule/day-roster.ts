import type { createClient } from '@/lib/supabase/server'
import { resolveParty } from '@/lib/party/resolve'

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
  if (segmentIds.length === 0 && hotelStayIds.length === 0) return []

  const [transport, hotel] = await Promise.all([
    resolveParty(supabase, tourId, { kind: 'transport_segment', ids: segmentIds }),
    resolveParty(supabase, tourId, { kind: 'hotel_stay', ids: hotelStayIds }),
  ])

  const rosterMap = new Map<string, RosterPerson>()
  for (const p of [...transport.people, ...hotel.people]) {
    if (p.name && !rosterMap.has(p.id)) {
      rosterMap.set(p.id, { id: p.id, name: p.name, person_type: p.person_type })
    }
  }
  return Array.from(rosterMap.values())
}
