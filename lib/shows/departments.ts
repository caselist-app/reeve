// The department/doc_type constants, split out of advance.ts so they can be
// imported by code that must stay unit-testable (lib/documents/doc-types.ts)
// without dragging in lib/supabase/admin, which imports 'server-only' and
// cannot resolve outside a Next.js runtime.
//
// One map, both directions, in exactly one place. This existed twice before:
// here as doc_type to department (for the acknowledge path) and on the show
// page as department to doc_type (for the send path), so the two could
// disagree about which rider belonged to which department and nothing would
// have said so.

export type Department = 'audio' | 'lighting' | 'staging' | 'hospitality' | 'travel'

// The four departments that advance through a document, and the doc_type each
// one sends. `travel` is the fifth department on show_advance and has no rider,
// so a TM moves it by hand and it never appears in the document list.
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
