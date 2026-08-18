import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Matches an inbound emoji reaction back to the notification_log row it
// acknowledges, keyed on provider_message_id (unique across the table since
// the reaction migration). Mirrors the existing delivered_at/read_at idiom on
// the same table: first reaction wins, guarded by .is('reacted_at', null), so
// neither a later reaction nor a removal ever overwrites the first one.

export type RecordReactionInput = {
  providerMessageId: string
  // Empty or missing means removed, or a shape this session could not
  // confirm. Either way, a no-op: see the brief's "Reconfirm at build time"
  // note on the removal payload.
  emoji: string
  // Not part of the query: provider_message_id is unique across the whole
  // table regardless of channel. Kept on the type so a caller's intent is
  // explicit and so a future log line can say which provider it arrived from.
  channel: 'whatsapp' | 'telegram'
}

export async function recordReaction(
  admin: SupabaseClient<Database>,
  input: RecordReactionInput
): Promise<{ recorded: boolean }> {
  if (!input.emoji) return { recorded: false }

  const { data } = await admin
    .from('notification_log')
    .update({ reacted_at: new Date().toISOString(), reaction_emoji: input.emoji })
    .eq('provider_message_id', input.providerMessageId)
    .is('reacted_at', null)
    .select('id')

  return { recorded: (data?.length ?? 0) > 0 }
}
