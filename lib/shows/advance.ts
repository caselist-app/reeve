import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/types/database'

export type Department = 'audio' | 'lighting' | 'staging' | 'hospitality' | 'travel'
export type AdvanceStatus = 'not_started' | 'in_progress' | 'done'

// Maps the department name to the show_advance column it controls.
// Both the UI action and the document-share webhook (Brief 11) use this
// function so the mapping never drifts between callers.
const DEPARTMENT_COLUMN: Record<
  Department,
  'status_audio' | 'status_lighting' | 'status_staging' | 'status_hospitality' | 'status_travel'
> = {
  audio: 'status_audio',
  lighting: 'status_lighting',
  staging: 'status_staging',
  hospitality: 'status_hospitality',
  travel: 'status_travel',
}

// Returns an error string on failure, null on success.
// Accepts either the user client or the admin client so it can be called
// from server actions (user client) and from the document-share webhook (admin client).
export async function setAdvanceStatus(
  showId: string,
  department: Department,
  status: AdvanceStatus,
  supabase: SupabaseClient<Database>
): Promise<string | null> {
  const col = DEPARTMENT_COLUMN[department]

  // Cast required: the Supabase client rejects index-signature types.
  // The assignment is safe because col is always a valid show_advance column.
  const { error } = await supabase
    .from('show_advance')
    .update({ [col]: status } as TablesUpdate<'show_advance'>)
    .eq('show_id', showId)

  return error?.message ?? null
}
