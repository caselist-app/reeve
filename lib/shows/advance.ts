import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TablesUpdate } from '@/lib/types/database'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEPARTMENT_DOC_TYPE, type Department, type DocumentedDepartment } from '@/lib/shows/departments'

export type { Department, DocumentedDepartment } from '@/lib/shows/departments'
export { DEPARTMENT_DOC_TYPE, DEPARTMENT_LABELS } from '@/lib/shows/departments'

export type AdvanceStatus = 'not_started' | 'in_progress' | 'done'
export type AdvanceColumn =
  | 'status_audio'
  | 'status_lighting'
  | 'status_staging'
  | 'status_hospitality'
  | 'status_travel'

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

// Not every person on this list is actually contactable: a person with no
// contact_email is still listed (the send panel greys them out rather than
// hiding them), so contact_email is nullable here.
export type ContactablePerson = {
  id: string
  name: string
  contact_email: string | null
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
const DEPARTMENT_COLUMN: Record<Department, AdvanceColumn> = {
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

// Maps a document doc_type to the show_advance column it controls, or null for
// a doc_type with no department behind it. The one source of truth for both
// acknowledgement paths (the button and the Resend webhook), built from
// DEPARTMENT_DOC_TYPE so a new rider type cannot advance the wrong column, or a
// nonexistent one: the webhook used to keep its own copy of this map, which had
// drifted to include a `travel_brief` doc_type nothing ever writes.
export function docTypeToAdvanceColumn(docType: string): AdvanceColumn | null {
  const department = docTypeToDepartment(docType)
  return department ? DEPARTMENT_COLUMN[department] : null
}

// Called by the Resend webhook when a recipient clicks the tracked acknowledge
// link in a shared document email. Marks the share acknowledged and nudges the
// relevant department from not_started to in_progress on the one show the share
// belongs to.
//
// Deliberately distinct from updateAdvanceStatusFromShare, the button path,
// which promotes straight to 'done'. A tracked-link click is a weaker signal
// than the recipient landing on the acknowledge page and confirming, and both
// fire for the same click, so the webhook only nudges and the page POST
// finishes the job.
//
// Scoped by show_id, never tour_id: show_advance holds one row per show with
// tour_id denormalised on it, so filtering by tour_id marked every show on the
// tour advanced off a single rider (REE-8).
export async function nudgeAdvanceFromShareClick(
  admin: SupabaseClient<Database>,
  shareToken: string
): Promise<void> {
  const now = new Date().toISOString()

  const { data: share } = await admin
    .from('document_shares')
    .update({ acknowledged_at: now, opened_at: now })
    .eq('share_token', shareToken)
    .is('acknowledged_at', null)
    .select('show_id, documents(doc_type)')
    .single()

  if (!share?.show_id) return

  const doc = share.documents as { doc_type: string } | null
  if (!doc) return

  const column = docTypeToAdvanceColumn(doc.doc_type)
  if (!column) return

  await admin
    .from('show_advance')
    .update({ [column]: 'in_progress' } as TablesUpdate<'show_advance'>)
    .eq('show_id', share.show_id)
    .eq(column, 'not_started')
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
