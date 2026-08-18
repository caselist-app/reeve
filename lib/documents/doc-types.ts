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
export const GENERAL_SECTION: DocSection = { docType: 'general', label: 'General' }
export const MARKETING_SECTION: DocSection = { docType: 'marketing', label: 'Marketing' }

// Per REE-295, multiple departments can map to the same doc_type (e.g. audio and
// staging both map to production_rider). Deduplicate by docType, keeping the
// first occurrence of each.
const deduplicatedRiderSections = Array.from(
  new Map(RIDER_SECTIONS.map((s) => [s.docType, s])).values()
)

// Order is load bearing: riders first (deduplicated), then General, then
// Marketing, Other always last.
export const DOC_SECTIONS: readonly DocSection[] = [
  ...deduplicatedRiderSections,
  GENERAL_SECTION,
  MARKETING_SECTION,
  OTHER_SECTION,
]

const SECTION_BY_DOC_TYPE = new Map(DOC_SECTIONS.map((s) => [s.docType, s]))

/** The section a doc_type belongs to. An unrecognised doc_type falls back to Other. */
export function sectionForDocType(docType: string): DocSection {
  return SECTION_BY_DOC_TYPE.get(docType) ?? OTHER_SECTION
}

// doc_types a TM can pick when manually uploading a document. boarding_pass is
// excluded: it is written by lib/actions/boarding-pass-upload.ts when a
// transport boarding pass is recorded against an assignment, never chosen from
// a manual upload form.
export const UPLOADABLE_DOC_TYPES: readonly string[] = [
  ...RIDER_SECTIONS.map((s) => s.docType),
  GENERAL_SECTION.docType,
  MARKETING_SECTION.docType,
]

// The sections the upload panel's doc_type picker offers: riders, then
// General, then Marketing, same order as DOC_SECTIONS minus Other (never
// uploadable).
export const UPLOADABLE_SECTIONS: readonly DocSection[] = [
  ...RIDER_SECTIONS,
  GENERAL_SECTION,
  MARKETING_SECTION,
]

// doc_types where more than one row is allowed to be is_current at once.
// uploadDocument skips the flip-to-not-current step for these: a festival's
// parking map and its stage plot are unrelated documents, not versions of
// one another, and treating them as a single (tour_id, doc_type) lineage
// would silently archive one every time the TM uploaded the other.
//
// Named as its own list, not folded into a boolean on DocSection, so REE-299
// (multiple concurrent riders per department) can extend this same array
// later instead of inventing a second mechanism.
export const MULTI_CURRENT_DOC_TYPES: readonly string[] = [
  GENERAL_SECTION.docType,
  MARKETING_SECTION.docType,
]
