'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { resolveAttentionItem } from '@/lib/actions/inbox'
import { findRosterBackfillCandidates, RELATED_TABLE } from '@/lib/party/roster-backfill'
import { roomTierFor } from '@/lib/party/room-tier'
import type { TablesInsert } from '@/lib/types/database'

export type RosterBackfillActionState = { error: string | null }

// Applies a roster_backfill Inbox item: writes the transport_assignment /
// room_assignment rows for every upcoming whole-party or by-type item the
// person is still missing from, then resolves the row. Brief 35, D3.
//
// Recomputes the candidate list rather than reading one off the item
// (CLAUDE.md's Inbox producer contract: "the row holds a headline and a
// pointer, never a payload"), so anything a TM already filled in by hand, or
// a previous partial apply, is picked up correctly and never double-written.
export async function applyRosterBackfill(personId: string): Promise<RosterBackfillActionState> {
  const user = await requireUser()
  const supabase = await createClient()

  // tours!inner scopes the read to a tour this account owns, the same
  // ownership gate as any other cross-table lookup in this file's siblings.
  const { data: person } = await supabase
    .from('people')
    .select('tour_id, person_type, tours!inner(account_id)')
    .eq('id', personId)
    .eq('tours.account_id', user.id)
    .single()

  if (!person) return { error: 'Person not found.' }

  const tourId = person.tour_id

  const { candidates, error: findError } = await findRosterBackfillCandidates(
    supabase,
    tourId,
    person.person_type,
  )
  if (findError) return { error: findError }

  const segmentIds = candidates.filter((c) => c.table === 'transport_segments').map((c) => c.id)
  const stayIds = candidates.filter((c) => c.table === 'hotel_stays').map((c) => c.id)

  if (segmentIds.length > 0) {
    const rows: TablesInsert<'transport_assignments'>[] = segmentIds.map((segment_id) => ({
      tour_id: tourId,
      segment_id,
      person_id: personId,
    }))
    const { error } = await supabase.from('transport_assignments').insert(rows)
    if (error) return { error: error.message }
  }

  if (stayIds.length > 0) {
    const roomTier = roomTierFor(person.person_type)
    const rows: TablesInsert<'room_assignments'>[] = stayIds.map((hotel_stay_id) => ({
      tour_id: tourId,
      hotel_stay_id,
      person_id: personId,
      room_tier: roomTier,
    }))
    const { error } = await supabase.from('room_assignments').insert(rows)
    if (error) return { error: error.message }
  }

  revalidatePath(`/tours/${tourId}/schedule`)
  revalidatePath(`/tours/${tourId}/transport`)
  revalidatePath(`/tours/${tourId}/hotels`)

  // Rule 3 of brief 53: a producer resolves after its own write succeeds,
  // never before. Anything returning an error above leaves this unreached, so
  // the item stays open and a retry re-derives whatever is still missing.
  await resolveAttentionItem(RELATED_TABLE, personId)

  return { error: null }
}
