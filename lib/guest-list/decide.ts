import { resolveGuestRequestAttention } from '@/lib/guest-list/attention'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The approve and decline core, shared by the panel's server actions and the
// Telegram callback job. Brief 52, step 3 (REE-130).
//
// It has NO requireUser(), deliberately: a Telegram button is pressed by a TM
// who has no web session, so the job calls this the same way runBroadcast is
// called without a user (brief 30). The action supplies the auth gate; the job
// supplies the account resolution. Both then resolve which tour the entry is on
// and hand it here, so the read below is always scoped by tour.
//
// The scope is (entryId, tourId), not entryId alone. RLS scopes rows by tour but
// does not check that two ids in one payload belong to the same tour, so an
// entry the caller owns on a different tour would otherwise be actionable from
// the wrong tour's surface. Scoping the read by both is the check.

type Client = SupabaseClient<Database>

export type GuestDecision = 'approve' | 'decline'

// Non-null when approving pushes this pass type past the show's allotment. The
// panel says "this puts you two over" after the fact. It warns, it does not
// block, so approve still succeeds when it is set.
export type OverAllotment = { passType: string; over: number }

export type DecideOutcome = {
  error: string | null
  // The status after the call, or the current status when it was already
  // decided. Absent on an error.
  status?: string
  // True when the entry was not 'requested', so this call changed nothing. Both
  // the panel and the Telegram handler read it to avoid sending the guest a
  // second email, and it is why updated_at does not move on a repeat.
  alreadyDecided?: boolean
  // Approve only. Null on a decline or when the show has no allotment for the
  // pass type (no row means no limit).
  overAllotment?: OverAllotment | null
}

export async function decideGuestEntry(
  supabase: Client,
  args: { entryId: string; tourId: string; decision: GuestDecision; reason?: string | null },
): Promise<DecideOutcome> {
  const { entryId, tourId, decision, reason } = args

  const { data: entry } = await supabase
    .from('guest_list_entries')
    .select('id, tour_id, show_id, status, pass_type, num_tickets')
    .eq('id', entryId)
    .eq('tour_id', tourId)
    .maybeSingle()

  if (!entry) return { error: 'That guest is not on this tour.' }

  // Both transitions guard on 'requested'. A second approve or decline, whether
  // from a double-click in the panel or a stale Telegram button, must be a
  // no-op: not a second email to the guest, not a second overwrite of a decline
  // reason. Returning without an update is also why updated_at stays put.
  if (entry.status !== 'requested') {
    return { error: null, alreadyDecided: true, status: entry.status }
  }

  if (decision === 'decline') {
    const { error } = await supabase
      .from('guest_list_entries')
      .update({ status: 'declined', decline_reason: reason ?? null })
      .eq('id', entryId)
    if (error) return { error: error.message }
    // The request is dealt with, so drop it from the Inbox. Idempotent: only the
    // still-open row is touched, so a repeat decline changes nothing.
    await resolveGuestRequestAttention(supabase, { tourId, entryId })
    return { error: null, status: 'declined' }
  }

  const { error } = await supabase
    .from('guest_list_entries')
    .update({ status: 'approved' })
    .eq('id', entryId)
  if (error) return { error: error.message }

  await resolveGuestRequestAttention(supabase, { tourId, entryId })

  const overAllotment = await overAllotmentFor(supabase, entry.show_id, entry.pass_type)
  return { error: null, status: 'approved', overAllotment }
}

// The approved tally for one show and pass type against its allotment. Read
// after the approve lands, so the entry just approved is counted. A show with no
// allotment row for the pass type has no limit and can never be over.
async function overAllotmentFor(
  supabase: Client,
  showId: string,
  passType: string,
): Promise<OverAllotment | null> {
  const { data: allotment } = await supabase
    .from('guest_list_allotments')
    .select('num_allowed')
    .eq('show_id', showId)
    .eq('pass_type', passType)
    .maybeSingle()

  if (!allotment) return null

  const { data: approved } = await supabase
    .from('guest_list_entries')
    .select('num_tickets')
    .eq('show_id', showId)
    .eq('pass_type', passType)
    .eq('status', 'approved')

  const total = (approved ?? []).reduce((sum, row) => sum + (row.num_tickets ?? 0), 0)
  const over = total - allotment.num_allowed
  return over > 0 ? { passType, over } : null
}
