import { describe, it, expect } from 'vitest'
import { readForm } from '@/lib/forms/read-form'

// readForm is where the null versus undefined convention is actually decided,
// which makes it the most load-bearing pure function in the repo. Two bugs that
// silently destroyed user data on 2026-08-04 came from code that treated
// "the form did not send this" and "the TM cleared this" as the same thing.
//
// Brief 37 moved the decision to the only place that can make it correctly.
// FormData knows whether a field was posted; nothing downstream does. So:
//
//   key absent from the FormData   undefined  the form never rendered it
//   key present, empty string      null       the TM cleared it
//   key present, has a value       the value
//
// The old shape asked each caller to choose per field, once, for the whole
// form, via 'stringOrUndefined' and 'numberOrUndefined'. That cannot be right
// for a form with conditional sections: contact-sheet.tsx renders default_role
// only in roster context and the pay inputs only in tour context, so whichever
// kind it picked was wrong in the other mode. Both of Brief 37's remaining
// destructive instances were that one mistake, in opposite directions.

function formOf(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

describe('readForm', () => {
  it('reads a present value for every kind', () => {
    const fd = formOf({ a: 'x', c: 'z', n: '12' })
    const out = readForm(fd, { a: 'string', c: 'requiredString', n: 'number' })
    expect(out).toEqual({ a: 'x', c: 'z', n: 12 })
  })

  it('reads a field the form posted blank as null, meaning the TM cleared it', () => {
    const out = readForm(formOf({ a: '' }), { a: 'string' })
    expect(out.a).toBeNull()
  })

  it('reads a field the form never posted as undefined, meaning leave it alone', () => {
    const out = readForm(new FormData(), { a: 'string' })
    expect(out.a).toBeUndefined()
  })

  it('separates blank from absent in one payload, which is the whole point', () => {
    // An action receiving this must write `a` and skip `b`. Collapsing them one
    // way nulled six catering columns on every day-sheet save; collapsing them
    // the other way made a crew member's per diem impossible to clear.
    const out = readForm(formOf({ a: '' }), { a: 'string', b: 'string' })
    expect(out.a).toBeNull()
    expect(out.b).toBeUndefined()
    expect(out.a).not.toBe(out.b)
  })

  it('applies the same rule to numbers', () => {
    const posted = readForm(formOf({ n: '', m: '7' }), { n: 'number', m: 'number' })
    expect(posted.n).toBeNull()
    expect(posted.m).toBe(7)

    const absent = readForm(new FormData(), { n: 'number' })
    expect(absent.n).toBeUndefined()
  })

  it('reads zero as zero, not as blank', () => {
    // '0' is falsy as a string and 0 is falsy as a number, so every `|| null`
    // fallback in the repo's history would have turned a genuine zero rate into
    // a cleared one.
    const out = readForm(formOf({ n: '0' }), { n: 'number' })
    expect(out.n).toBe(0)
  })

  it('gives requiredString an empty string for both absent and blank', () => {
    // The HTML `required` attribute enforces presence; this kind only exists so
    // the action's non-null input type holds. It is deliberately outside the
    // null/undefined convention, because a required field has no "cleared".
    expect(readForm(new FormData(), { a: 'requiredString' }).a).toBe('')
    expect(readForm(formOf({ a: '' }), { a: 'requiredString' }).a).toBe('')
  })

  it('only reads keys named in the shape, ignoring anything else posted', () => {
    const out = readForm(formOf({ a: 'x', unexpected: 'y' }), { a: 'string' })
    expect(Object.keys(out)).toEqual(['a'])
  })

  it('keeps an absent key present-with-undefined, so a spread cannot resurrect it', () => {
    // A row mapper that spreads this object relies on the key existing with an
    // undefined value; `'key' in out` staying true is what lets a mapper tell
    // "not submitted" from "not a field at all".
    const out = readForm(new FormData(), { a: 'string' })
    expect('a' in out).toBe(true)
  })
})
