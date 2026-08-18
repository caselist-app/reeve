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
//
// REE-292/REE-294/REE-295: tech_rider and staging_rider consolidated into
// production_rider, which now maps 1:1 onto the single PRODUCTION department
// (audio and staging merged into it), and lighting_rider became lx_rider,
// mapping onto LX. The old doc_type values no longer exist in the database
// (migrated by the consolidation migration).
describe('docTypeToAdvanceColumn', () => {
  it('maps production_rider (formerly tech_rider/staging_rider) to status_production', () => {
    expect(docTypeToAdvanceColumn('production_rider')).toBe('status_production')
  })

  it('maps lx_rider (formerly lighting_rider) to status_lx', () => {
    expect(docTypeToAdvanceColumn('lx_rider')).toBe('status_lx')
  })

  it('maps hospitality_rider to status_hospitality', () => {
    expect(docTypeToAdvanceColumn('hospitality_rider')).toBe('status_hospitality')
  })

  it('returns null for old doc_types (tech_rider, staging_rider) that no longer exist (REE-295 migration)', () => {
    // These old doc_types were migrated to production_rider. Since individual
    // instances no longer exist in the database, they should return null.
    expect(docTypeToAdvanceColumn('tech_rider')).toBeNull()
    expect(docTypeToAdvanceColumn('staging_rider')).toBeNull()
  })

  it('returns null for travel_brief, the exact stray doc_type from REE-8', () => {
    // Travel dropped out of the advance vocabulary entirely (REE-292/REE-294):
    // it has no doc_type entry in DEPARTMENT_DOC_TYPE, is moved by hand, and
    // there is no doc_type that should ever resolve to a travel column.
    expect(docTypeToAdvanceColumn('travel_brief')).toBeNull()
  })

  it('returns null for a doc_type with no matching department at all', () => {
    expect(docTypeToAdvanceColumn('nonexistent_doc_type')).toBeNull()
  })
})
