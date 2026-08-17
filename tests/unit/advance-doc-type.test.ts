import { describe, it, expect, vi } from 'vitest'

// advance.ts imports lib/supabase/admin, which imports the 'server-only'
// package, a Next.js build-time guard with nothing to resolve outside a Next
// bundle. docTypeToAdvanceColumn itself never touches the admin client, so
// stubbing the import out is enough to load the module in plain vitest. Same
// pattern as tests/unit/hub-resolver-sync.test.ts.
vi.mock('server-only', () => ({}))

import { docTypeToAdvanceColumn } from '@/lib/shows/advance'

// REE-8: a stray 'travel_brief' doc_type advanced the wrong department in
// production, because docTypeToAdvanceColumn found no matching entry in
// DEPARTMENT_DOC_TYPE and something downstream treated the resulting column
// loosely instead of skipping the write. This pins the doc_type to
// show_advance column mapping so the map cannot drift without a test
// noticing, and pins the specific stray value from REE-8 to null.
describe('docTypeToAdvanceColumn', () => {
  it('maps tech_rider to status_audio', () => {
    expect(docTypeToAdvanceColumn('tech_rider')).toBe('status_audio')
  })

  it('maps lighting_rider to status_lighting', () => {
    expect(docTypeToAdvanceColumn('lighting_rider')).toBe('status_lighting')
  })

  it('maps staging_rider to status_staging', () => {
    expect(docTypeToAdvanceColumn('staging_rider')).toBe('status_staging')
  })

  it('maps hospitality_rider to status_hospitality', () => {
    expect(docTypeToAdvanceColumn('hospitality_rider')).toBe('status_hospitality')
  })

  it('returns null for travel_brief, the exact stray doc_type from REE-8', () => {
    // travel is the fifth show_advance department but has no doc_type entry
    // in DEPARTMENT_DOC_TYPE: it is advanced by hand, never via a rider, so
    // there is no doc_type that should ever resolve to status_travel.
    expect(docTypeToAdvanceColumn('travel_brief')).toBeNull()
  })

  it('returns null for a doc_type with no matching department at all', () => {
    expect(docTypeToAdvanceColumn('nonexistent_doc_type')).toBeNull()
  })
})
