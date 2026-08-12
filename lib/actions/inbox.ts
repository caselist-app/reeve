'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

export type InboxActionState = { error: string | null }

// Marks an attention_items row as read (brief 53, REE-150). RLS ("owner writes
// attention" on attention_items, owns_tour(tour_id)) is the ownership gate: a
// single id needs no ownership check of its own here.
//
// The `.is('read_at', null)` guard is what makes a second call a no-op rather
// than moving the timestamp forward, the same claim-once shape as
// resolveGuestRequestAttention in lib/guest-list/attention.ts. This never
// touches resolved_at: read and resolved are separate states (REE-148), and
// fetchInbox deliberately keeps a read item in the queue until it is resolved
// elsewhere, not until someone opens it.
export async function markAttentionItemRead(id: string): Promise<InboxActionState> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('attention_items')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)

  if (error) return { error: error.message }
  return { error: null }
}
