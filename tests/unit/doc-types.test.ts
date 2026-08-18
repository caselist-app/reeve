import { describe, it, expect } from 'vitest'
import { DOC_SECTIONS, UPLOADABLE_DOC_TYPES, sectionForDocType } from '@/lib/documents/doc-types'

// REE-1. The one list of what a document's doc_type can mean on the Documents
// page. Riders come from DEPARTMENT_DOC_TYPE (lib/shows/advance.ts) rather than
// a second copy, because that file already warns about the bug two competing
// maps caused (a rider that could disagree about which department it belonged
// to). Everything this page knows about a doc_type funnels through here.

describe('DOC_SECTIONS', () => {
  it('puts the three unique rider doc_types first and Other last (REE-295)', () => {
    const docTypes = DOC_SECTIONS.map((s) => s.docType)

    // Per REE-295, audio and staging both map to production_rider, so there are
    // only 3 unique rider doc_types instead of 4.
    expect(docTypes.slice(0, 3).sort()).toEqual(
      ['production_rider', 'lx_rider', 'hospitality_rider'].sort()
    )
    expect(docTypes[docTypes.length - 1]).toBe('other')
  })

  it('has no duplicate sections by docType', () => {
    const docTypes = DOC_SECTIONS.map((s) => s.docType)
    expect(new Set(docTypes).size).toBe(docTypes.length)
  })
})

describe('sectionForDocType', () => {
  it('maps an unknown doc_type to Other', () => {
    expect(sectionForDocType('press_kit').docType).toBe('other')
    expect(sectionForDocType('press_kit').label).toBe('Other')
  })

  it('maps production_rider (from audio or staging) to its own section', () => {
    expect(sectionForDocType('production_rider').docType).toBe('production_rider')
  })

  it('maps lx_rider (formerly lighting_rider) to its own section', () => {
    expect(sectionForDocType('lx_rider').docType).toBe('lx_rider')
  })

  it('maps hospitality_rider to its own section', () => {
    expect(sectionForDocType('hospitality_rider').docType).toBe('hospitality_rider')
  })
})

describe('UPLOADABLE_DOC_TYPES', () => {
  it('does not include boarding_pass', () => {
    // boarding_pass is written by lib/actions/boarding-pass-upload.ts when a
    // TM records a boarding pass against a transport assignment. A TM never
    // picks it from a manual upload form.
    expect(UPLOADABLE_DOC_TYPES).not.toContain('boarding_pass')
  })
})
