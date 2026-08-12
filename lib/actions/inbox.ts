'use server'

import { revalidatePath } from 'next/cache'
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

// The one exception to "producers create rows and producers resolve them"
// (brief 53): a dangling pointer, where related_id no longer resolves to
// anything, is a row no producer will ever come back to resolve. This is the
// only place in the app that calls it directly from the UI; every other
// caller is a producer's own decide path (e.g. decideGuestEntry), resolving
// after its write succeeds, never before (rule 3 of the brief).
//
// Takes the pointer, not the item's own id: a producer knows what it just
// wrote and does not know the attention_items row's id. `.is('resolved_at',
// null)` makes a second call a no-op.
export async function resolveAttentionItem(
  relatedTable: string,
  relatedId: string,
): Promise<InboxActionState> {
  await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('attention_items')
    .update({ resolved_at: new Date().toISOString() })
    .eq('related_table', relatedTable)
    .eq('related_id', relatedId)
    .is('resolved_at', null)

  if (error) return { error: error.message }

  revalidatePath('/inbox')

  return { error: null }
}
