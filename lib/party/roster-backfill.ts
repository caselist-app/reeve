import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import { localDateInZone } from '@/lib/schedule/datetime'

type Client = SupabaseClient<Database>

export const RELATED_TABLE = 'people'

export interface RosterBackfillCandidate {
  table: 'transport_segments' | 'hotel_stays'
  id: string
}

// D1/D3 (brief 35): 'whole_party' applies to anyone, 'artist' and 'crew' apply
// only to a matching person_type, and 'named' never applies. A manifest built
// by name is a deliberate choice the product never second-guesses on someone
// else's behalf.
function appliesToPersonType(createdAs: string, personType: string): boolean {
  if (createdAs === 'whole_party') return true
  if (createdAs === 'artist') return personType === 'artist'
  if (createdAs === 'crew') return personType === 'crew'
  return false
}

// Every upcoming transport_segment/hotel_stay whose created_as is
// 'whole_party' or matches personType. Does not check
// transport_assignments/room_assignments: at write time (called from
// addPerson) the person is brand new and cannot already hold an assignment
// row, and apply runs the same live query straight after, so there is
// nothing to exclude in the normal path. If a TM manually attaches the
// person to one of these via the party picker in the gap between the Inbox
// row being written and applied, the matching insert in applyRosterBackfill
// hits transport_assignments' own unique(segment_id, person_id) constraint
// and the whole apply fails rather than silently double-booking, which is
// the failure path CLAUDE.md's producer contract exists to leave open for a
// retry rather than resolve over.
export async function findRosterBackfillCandidates(
  supabase: Client,
  tourId: string,
  personType: string,
): Promise<{ candidates: RosterBackfillCandidate[]; error: string | null }> {
  const { data: tour } = await supabase.from('tours').select('timezone').eq('id', tourId).single()
  const timezone = tour?.timezone ?? 'UTC'
  const nowIso = new Date().toISOString()
  const today = localDateInZone(nowIso, timezone)

  const [segmentsResult, staysResult] = await Promise.all([
    supabase
      .from('transport_segments')
      .select('id, created_as')
      .eq('tour_id', tourId)
      .in('created_as', ['whole_party', 'artist', 'crew'])
      .or(`depart_at.gte.${nowIso},depart_at.is.null`),
    supabase
      .from('hotel_stays')
      .select('id, created_as')
      .eq('tour_id', tourId)
      .in('created_as', ['whole_party', 'artist', 'crew'])
      .or(`check_out_date.gte.${today},check_out_date.is.null`),
  ])

  if (segmentsResult.error) return { candidates: [], error: segmentsResult.error.message }
  if (staysResult.error) return { candidates: [], error: staysResult.error.message }

  const candidates: RosterBackfillCandidate[] = []
  for (const seg of segmentsResult.data ?? []) {
    if (appliesToPersonType(seg.created_as, personType)) {
      candidates.push({ table: 'transport_segments', id: seg.id })
    }
  }
  for (const stay of staysResult.data ?? []) {
    if (appliesToPersonType(stay.created_as, personType)) {
      candidates.push({ table: 'hotel_stays', id: stay.id })
    }
  }

  return { candidates, error: null }
}

// Writes the batched Inbox row for a roster gap, one row for the whole run
// rather than one per item (brief 35, D3). Best effort, the same shape as
// writeGuestRequestAttention: the person has already been saved, so a failure
// here is logged, never thrown.
export async function writeRosterBackfillAttention(
  supabase: Client,
  args: { tourId: string; personId: string; personName: string; count: number },
): Promise<void> {
  if (args.count === 0) return

  const { error } = await supabase.from('attention_items').insert({
    tour_id: args.tourId,
    kind: 'roster_backfill',
    title: `${args.personName} is not on ${args.count} upcoming item${args.count === 1 ? '' : 's'}, add them?`,
    related_table: RELATED_TABLE,
    related_id: args.personId,
  })
  if (error) {
    console.error('[roster-backfill] could not write attention item:', error.message)
  }
}
