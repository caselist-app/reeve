import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The attention_items rows a guest request writes and later resolves. Brief 52,
// step 7 (REE-134). REE-49 owns the Inbox shell and the table's schema; this only
// writes rows and resolves them, and touches none of that schema.
//
// One row per requested entry, deep-linked back to it via
// (related_table, related_id). Approving, declining or removing the entry sets
// resolved_at so the Inbox drops it. severity is left to the table default (3).

type Client = SupabaseClient<Database>

const RELATED_TABLE = 'guest_list_entries'

// Writes the Inbox row for a new request. Best effort at the call site: the crew
// member has already had their reply, so a failure here is logged, never thrown.
export async function writeGuestRequestAttention(
  supabase: Client,
  args: { tourId: string; entryId: string; title: string },
): Promise<void> {
  const { error } = await supabase.from('attention_items').insert({
    tour_id: args.tourId,
    kind: 'guest_request',
    title: args.title,
    related_table: RELATED_TABLE,
    related_id: args.entryId,
  })
  if (error) {
    console.error('[guest-request] could not write attention item:', error.message)
  }
}

// Resolves the open Inbox row for an entry, on approve, decline or remove. Scoped
// by tour and entry and only the still-open row, so a repeated decision is a
// no-op and a resolved row keeps its first resolved_at. Idempotent by design.
export async function resolveGuestRequestAttention(
  supabase: Client,
  args: { tourId: string; entryId: string },
): Promise<void> {
  const { error } = await supabase
    .from('attention_items')
    .update({ resolved_at: new Date().toISOString() })
    .eq('tour_id', args.tourId)
    .eq('related_table', RELATED_TABLE)
    .eq('related_id', args.entryId)
    .is('resolved_at', null)
  if (error) {
    console.error('[guest-request] could not resolve attention item:', error.message)
  }
}
