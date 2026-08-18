import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// The attention_items row a confirmed Telegram disconnect writes and later
// resolves (brief 63, REE-309). Same shape as lib/guest-list/attention.ts:
// write on the event, resolve on reconnect, both idempotent and both logged
// rather than thrown, since the crew member's own reply has already gone out
// by the time either runs.

type Client = SupabaseClient<Database>

const RELATED_TABLE = 'contacts'
const KIND = 'telegram_disconnect'

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  planning: 1,
  completed: 2,
  archived: 3,
}

export interface WrittenDisconnectAttention {
  tourId: string
  itemId: string
}

// Resolves which tour to file against and writes the Inbox row. contacts's own
// telegram_chat_id is already cleared by the time this runs (the disconnect
// write commits first), so the tour can't be resolved off the chat id the way
// an ordinary inbound message is: it goes through people -> tours on the
// contact id instead, with the same STATUS_ORDER tie-break
// app/api/telegram/inbound/route.ts uses (active, planning, completed,
// archived; most recent created_at breaks ties), since a contact can crew more
// than one tour at once.
//
// A contact with no people row on any tour has nothing to file against:
// returns null rather than writing a row with no tour, and the caller treats
// that as a silent no-op.
export async function writeDisconnectAttention(
  supabase: Client,
  args: { contactId: string; contactName: string },
): Promise<WrittenDisconnectAttention | null> {
  const { data: people } = await supabase
    .from('people')
    .select('tour_id, tours!inner(status, created_at)')
    .eq('contact_id', args.contactId)

  if (!people || people.length === 0) return null

  const sorted = [...people].sort((a, b) => {
    const ta = a.tours as { status: string; created_at: string } | null
    const tb = b.tours as { status: string; created_at: string } | null
    const sa = STATUS_ORDER[ta?.status ?? 'archived'] ?? 3
    const sb = STATUS_ORDER[tb?.status ?? 'archived'] ?? 3
    if (sa !== sb) return sa - sb
    return new Date(tb?.created_at ?? 0).getTime() - new Date(ta?.created_at ?? 0).getTime()
  })

  const tourId = sorted[0]?.tour_id
  if (!tourId) return null

  const { data: item, error } = await supabase
    .from('attention_items')
    .insert({
      tour_id: tourId,
      kind: KIND,
      title: `Telegram disconnected: ${args.contactName}`,
      related_table: RELATED_TABLE,
      related_id: args.contactId,
    })
    .select('id')
    .single()

  if (error || !item) {
    console.error('[telegram-disconnect] could not write attention item:', error?.message)
    return null
  }

  return { tourId, itemId: item.id }
}

// Resolves the open alert on reconnect (handleLinking's contact-relink success
// branch). Scoped by kind as well as the (related_table, related_id) pointer:
// 'contacts' is not used as a related_table by any other producer today, but
// scoping to this producer's own kind keeps a future one from being resolved
// by this call by accident. `.is('resolved_at', null)` makes a repeat call,
// or a reconnect with no open alert, a no-op rather than moving the timestamp.
export async function resolveDisconnectAttention(
  supabase: Client,
  args: { contactId: string },
): Promise<void> {
  const { error } = await supabase
    .from('attention_items')
    .update({ resolved_at: new Date().toISOString() })
    .eq('kind', KIND)
    .eq('related_table', RELATED_TABLE)
    .eq('related_id', args.contactId)
    .is('resolved_at', null)

  if (error) {
    console.error('[telegram-disconnect] could not resolve attention item:', error.message)
  }
}
