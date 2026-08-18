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

export type Department = 'production' | 'lx' | 'hospitality'

// The three departments that advance through a document, and the doc_type
// each one sends. Per REE-292's decision: PRODUCTION absorbs the old audio and
// staging departments (both fed by the single production_rider doc_type, per
// REE-295), LX is a straight rename of lighting (lx_rider), and HOSPITALITY is
// unchanged. Travel drops out of the advance vocabulary entirely rather than
// folding into PRODUCTION: it has no rider and is moved by hand, so it never
// belonged in a doc_type map.
export const DEPARTMENT_DOC_TYPE = {
  production: 'production_rider',
  lx: 'lx_rider',
  hospitality: 'hospitality_rider',
} as const

export type DocumentedDepartment = keyof typeof DEPARTMENT_DOC_TYPE

export const DEPARTMENT_LABELS: Record<Department, string> = {
  production: 'PRODUCTION',
  lx: 'LX',
  hospitality: 'HOSPITALITY',
}
