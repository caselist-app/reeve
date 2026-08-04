import { describe, it, expect } from 'vitest'
import { readForm } from '@/lib/forms/read-form'

// readForm is where the null versus undefined convention is actually decided,
// which makes it the most load-bearing pure function in the repo. Two bugs that
// silently destroyed user data on 2026-08-04 came from code that treated
// "the form did not send this" and "the TM cleared this" as the same thing.
//
// These tests pin the convention down so a future change to readForm has to be
// deliberate rather than incidental:
//   'string'             blank or missing reads as null   ("cleared")
//   'stringOrUndefined'  blank or missing reads as undefined ("not submitted")
//   'number'             blank reads as null
//   'numberOrUndefined'  blank reads as undefined

function formOf(entries: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

describe('readForm', () => {
  it('reads a present value for every kind', () => {
    const fd = formOf({ a: 'x', b: 'y', c: 'z', n: '12', m: '13' })
    const out = readForm(fd, {
      a: 'string',
      b: 'stringOrUndefined',
      c: 'requiredString',
      n: 'number',
      m: 'numberOrUndefined',
    })
    expect(out).toEqual({ a: 'x', b: 'y', c: 'z', n: 12, m: 13 })
  })

  it("treats a blank string field as null, meaning the TM cleared it", () => {
    const out = readForm(formOf({ a: '' }), { a: 'string' })
    expect(out.a).toBeNull()
  })

  it('treats a missing string field as null too', () => {
    const out = readForm(new FormData(), { a: 'string' })
    expect(out.a).toBeNull()
  })

  it("treats a blank stringOrUndefined field as undefined, meaning not submitted", () => {
    const out = readForm(formOf({ a: '' }), { a: 'stringOrUndefined' })
    expect(out.a).toBeUndefined()
  })

  it('reads a blank number as null and a blank numberOrUndefined as undefined', () => {
    const out = readForm(formOf({ n: '', m: '' }), { n: 'number', m: 'numberOrUndefined' })
    expect(out.n).toBeNull()
    expect(out.m).toBeUndefined()
  })

  it('gives requiredString an empty string rather than null, so the action type holds', () => {
    const out = readForm(new FormData(), { a: 'requiredString' })
    expect(out.a).toBe('')
  })

  it('only reads keys named in the shape, ignoring anything else posted', () => {
    const out = readForm(formOf({ a: 'x', unexpected: 'y' }), { a: 'string' })
    expect(Object.keys(out)).toEqual(['a'])
  })

  it('distinguishes null from undefined in the same payload', () => {
    // This is the whole point. An action receiving this object must write `a`
    // and skip `b`. Collapsing them is what nulled six catering columns on
    // every day-sheet save from the schedule panel.
    const out = readForm(formOf({ a: '' }), { a: 'string', b: 'stringOrUndefined' })
    expect(out.a).toBeNull()
    expect(out.b).toBeUndefined()
    expect(out.a).not.toBe(out.b)
  })
})
