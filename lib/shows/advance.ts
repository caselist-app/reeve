import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

export type Department = 'audio' | 'lighting' | 'staging' | 'hospitality' | 'travel'
export type AdvanceStatus = 'not_started' | 'in_progress' | 'done'

// Maps the department name to the show_advance column it controls.
// Both the UI action and the document-share acknowledge path use this
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
// from server actions (user client) and from the acknowledge API (admin client).
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

// Called by the acknowledge API after a venue contact clicks "Acknowledge".
// Reads the share_token to find the share row, maps doc_type to the advance
// department, then promotes that department to 'done' on the linked show.
// Uses the admin client: this runs outside a user session (public route).
export async function updateAdvanceStatusFromShare(shareToken: string): Promise<void> {
  const admin = createAdminClient()

  const { data: share } = await admin
    .from('document_shares')
    .select(`
      show_id,
      documents ( doc_type )
    `)
    .eq('share_token', shareToken)
    .single()

  if (!share?.show_id) return

  const doc = share.documents as { doc_type: string } | null
  if (!doc) return

  const department = docTypeToDepartment(doc.doc_type)
  if (!department) return

  await setAdvanceStatus(share.show_id, department, 'done', admin)
}

// Maps a document doc_type to the advance department it controls.
// Unknown doc types are silently ignored: the share is acknowledged but
// no advance status changes (correct for generic docs with no department mapping).
function docTypeToDepartment(docType: string): Department | null {
  const map: Partial<Record<string, Department>> = {
    tech_rider:        'audio',
    hospitality_rider: 'hospitality',
    lighting_rider:    'lighting',
    staging_rider:     'staging',
  }
  return map[docType] ?? null
}
