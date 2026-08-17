import { describe, it, expect } from 'vitest'
import { definedOnly } from '@/lib/forms/write-row'

// The write half of the convention readForm decides. See tests/unit/read-form.test.ts
// for the full history: undefined means the form never sent the field (leave the
// column alone), null means the TM explicitly cleared it (write it). readForm can
// only produce that distinction; a row mapper has to preserve it all the way to the
// Supabase call, and definedOnly is the one place that is done generically rather
// than field by field. toRow (lib/actions/contacts.ts) coerced default_role and
// default_person_type to null on every tour-context edit before this existed,
// because a hand-written conditional spread was applied one field at a time rather
// than to the whole row.

describe('definedOnly', () => {
  it('omits a key entirely when its value is undefined', () => {
    // A present key holding undefined would still serialise fine through
    // supabase-js's JSON.stringify (which drops it), but the point of this
    // function is to make that true of the object itself, not rely on the
    // serialiser downstream. So assert the key is gone from Object.keys, not
    // just that the value reads as undefined.
    const out = definedOnly({ a: undefined })
    expect(Object.keys(out)).not.toContain('a')
    expect('a' in out).toBe(false)
  })

  it('keeps a null value, present and equal to null, so the column is cleared', () => {
    const out = definedOnly({ a: null })
    expect('a' in out).toBe(true)
    expect(out.a).toBeNull()
  })

  it('passes a present, non-null value through unchanged', () => {
    const out = definedOnly({ a: 'x', n: 0, b: false })
    expect(out).toEqual({ a: 'x', n: 0, b: false })
  })

  it('separates blank from absent in one payload, which is the whole point', () => {
    // Mirrors readForm's own "separates blank from absent" test. A row mapper
    // handed this object must write cleared and real fields and skip the
    // untouched one, in a single call, not three separately reasoned ones.
    const out = definedOnly({ cleared: null, untouched: undefined, kept: 'value' })

    expect(Object.keys(out).sort()).toEqual(['cleared', 'kept'])
    expect(out.cleared).toBeNull()
    expect(out.kept).toBe('value')
    expect('untouched' in out).toBe(false)
  })
})
