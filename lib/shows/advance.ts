import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'

export type Department = 'audio' | 'lighting' | 'staging' | 'hospitality' | 'travel'
export type AdvanceStatus = 'not_started' | 'in_progress' | 'done'

// The four departments that advance through a document, and the doc_type each
// one sends. `travel` is the fifth department on show_advance and has no rider,
// so a TM moves it by hand and it never appears in the document list.
//
// One map, both directions. This existed twice: here as doc_type to department
// (for the acknowledge path) and on the show page as department to doc_type
// (for the send path), so the two could disagree about which rider belonged to
// which department and nothing would have said so.
export const DEPARTMENT_DOC_TYPE = {
  audio: 'tech_rider',
  lighting: 'lighting_rider',
  staging: 'staging_rider',
  hospitality: 'hospitality_rider',
} as const

export type DocumentedDepartment = keyof typeof DEPARTMENT_DOC_TYPE

export const DEPARTMENT_LABELS: Record<Department, string> = {
  audio: 'Audio',
  lighting: 'Lighting',
  staging: 'Staging',
  hospitality: 'Hospitality',
  travel: 'Travel',
}

// Plain data shapes shared by the advance panel, the rider send panel and the
// server action that feeds them. They live here rather than in a component
// because a server action cannot import from a 'use client' file without
// dragging the component graph with it, and stores/side-panel-store.ts had
// already resorted to hand-copying them with a comment saying so.
export type SendableDocument = {
  id: string
  title: string
  doc_type: string
}

export type ContactablePerson = {
  id: string
  name: string
  contact_email: string
}

/** One document_shares row, shaped for the UI. */
export type ShareRow = {
  id: string
  document_id: string
  document_title: string
  doc_type: string
  recipient_name: string
  sent_at: string | null
  opened_at: string | null
  acknowledged_at: string | null
}

/** One department's worth of the advance: its riders and everything sent. */
export type DepartmentShareData = {
  department: DocumentedDepartment
  label: string
  docType: string
  documents: SendableDocument[]
  shares: ShareRow[]
}

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

// Maps a document doc_type to the advance department it controls, by inverting
// DEPARTMENT_DOC_TYPE rather than restating it.
//
// Unknown doc types are silently ignored: the share is acknowledged but no
// advance status changes, which is correct for a generic document with no
// department behind it.
function docTypeToDepartment(docType: string): Department | null {
  const entry = Object.entries(DEPARTMENT_DOC_TYPE).find(([, type]) => type === docType)
  return entry ? (entry[0] as Department) : null
}
