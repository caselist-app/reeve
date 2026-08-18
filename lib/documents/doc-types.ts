import { DEPARTMENT_DOC_TYPE, DEPARTMENT_LABELS, type DocumentedDepartment } from '@/lib/shows/departments'

// The one list of what a document's doc_type means on the Documents page
// (REE-1). The four rider sections come from DEPARTMENT_DOC_TYPE rather than a
// second copy: lib/shows/departments.ts already carries the warning that a
// rider mapping duplicated in two places can disagree about which department a
// rider belongs to, and this file would be exactly that second place.

export interface DocSection {
  docType: string
  label: string
}

const RIDER_DEPARTMENTS = Object.keys(DEPARTMENT_DOC_TYPE) as DocumentedDepartment[]

const RIDER_SECTIONS: DocSection[] = RIDER_DEPARTMENTS.map((department) => ({
  docType: DEPARTMENT_DOC_TYPE[department],
  label: DEPARTMENT_LABELS[department],
}))

export const OTHER_SECTION: DocSection = { docType: 'other', label: 'Other' }

// Per REE-295, multiple departments can map to the same doc_type (e.g. audio and
// staging both map to production_rider). Deduplicate by docType, keeping the
// first occurrence of each.
const deduplicatedRiderSections = Array.from(
  new Map(RIDER_SECTIONS.map((s) => [s.docType, s])).values()
)

// Order is load bearing: the riders first (deduplicated), Other always last.
export const DOC_SECTIONS: readonly DocSection[] = [...deduplicatedRiderSections, OTHER_SECTION]

const SECTION_BY_DOC_TYPE = new Map(DOC_SECTIONS.map((s) => [s.docType, s]))

/** The section a doc_type belongs to. An unrecognised doc_type falls back to Other. */
export function sectionForDocType(docType: string): DocSection {
  return SECTION_BY_DOC_TYPE.get(docType) ?? OTHER_SECTION
}

// doc_types a TM can pick when manually uploading a document. boarding_pass is
// excluded: it is written by lib/actions/boarding-pass-upload.ts when a
// transport boarding pass is recorded against an assignment, never chosen from
// a manual upload form.
export const UPLOADABLE_DOC_TYPES: readonly string[] = RIDER_SECTIONS.map((s) => s.docType)

// The sections the upload panel's doc_type picker offers, same rows as
// RIDER_SECTIONS and in the same order. Exported under its own name so the
// panel (REE-3) reads it as "what a TM can upload" rather than reaching for
// the rider-only name.
export const UPLOADABLE_SECTIONS: readonly DocSection[] = RIDER_SECTIONS
