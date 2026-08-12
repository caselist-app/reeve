import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Rule 13 in scripts/check-conventions.mjs flags a server action call written as
// a bare `await NAME(...)` statement, because that throws away the { error } the
// action returns: a failed save then looks exactly like a successful one and the
// TM is told "Saved." over a column that never changed. Six of these shipped at
// once, which is why the rule lands before any of them is fixed. That count is
// observed by running `node scripts/check-conventions.mjs` directly; this file
// pins the detection logic itself, so a later refactor cannot quietly stop it
// matching while every assertion still passes.
//
// Modelled on no-retired-routes.test.ts, which duplicates the script's regex and
// exercises it on string fixtures. The two halves are duplicated here the same
// way: which actions qualify (return type mentions error, resolving named types
// from their `export type X =` declaration), and which call shapes are flagged
// (a bare statement, not an assignment).

const ACTIONS_DIR = join('lib', 'actions')

// The return-type extraction: each exported async function and the annotation
// sitting between its parameter list and its body's opening brace.
function exportedAsyncFns(src: string): { name: string; returnType: string }[] {
  const out: { name: string; returnType: string }[] = []
  const re = /export\s+async\s+function\s+(\w+)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const p = src.indexOf('(', m.index)
    let parenDepth = 0
    let afterParams = -1
    for (let k = p; k < src.length; k++) {
      if (src[k] === '(') parenDepth++
      else if (src[k] === ')') {
        parenDepth--
        if (parenDepth === 0) {
          afterParams = k + 1
          break
        }
      }
    }
    if (afterParams === -1) continue
    // Skip the return type annotation, which can itself carry braces, to reach
    // the body's opening brace.
    let angleDepth = 0
    let brace = -1
    for (let k = afterParams; k < src.length; k++) {
      const c = src[k]
      if (c === '<') angleDepth++
      else if (c === '>') angleDepth--
      else if (c === '{' && angleDepth === 0) {
        brace = k
        break
      }
    }
    if (brace === -1) continue
    out.push({ name: m[1], returnType: src.slice(afterParams, brace) })
  }
  return out
}

// The body of an `export type X = ...` declaration, brace-matched when it is an
// object type and read to end of line otherwise.
function namedTypeBody(id: string, src: string): string | null {
  const m = new RegExp(`export\\s+type\\s+${id}\\s*=\\s*`).exec(src)
  if (!m) return null
  let start = m.index + m[0].length
  while (start < src.length && /\s/.test(src[start])) start++
  if (src[start] === '{') {
    let depth = 0
    for (let k = start; k < src.length; k++) {
      if (src[k] === '{') depth++
      else if (src[k] === '}') {
        depth--
        if (depth === 0) return src.slice(start, k + 1)
      }
    }
    return src.slice(start)
  }
  const nl = src.indexOf('\n', start)
  return src.slice(start, nl === -1 ? src.length : nl)
}

function returnTypeMentionsError(annotation: string, src: string): boolean {
  if (/\berror\b/.test(annotation)) return true
  for (const idMatch of annotation.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const body = namedTypeBody(idMatch[0], src)
    if (body && /\berror\b/.test(body)) return true
  }
  return false
}

function deriveErrorActions(): Set<string> {
  const actions = new Set<string>()
  for (const name of readdirSync(ACTIONS_DIR)) {
    if (!name.endsWith('.ts')) continue
    const src = readFileSync(join(ACTIONS_DIR, name), 'utf8')
    for (const fn of exportedAsyncFns(src)) {
      if (returnTypeMentionsError(fn.returnType, src)) actions.add(fn.name)
    }
  }
  return actions
}

// The call-site half: an action call is flagged only when it begins a statement,
// i.e. the text before `await` on its line is whitespace. An assignment or a
// return carries `= ` or `return ` there and is reading the result.
function flaggedActions(src: string, actions: Set<string>): string[] {
  const flagged: string[] = []
  for (const name of actions) {
    const re = new RegExp(`await\\s+${name}\\s*\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(src)) !== null) {
      const lineStart = src.lastIndexOf('\n', m.index - 1) + 1
      if (src.slice(lineStart, m.index).trim() === '') flagged.push(name)
    }
  }
  return flagged
}

describe('Rule 13 detects an unread server-action result', () => {
  const actions = deriveErrorActions()

  it('derived the error-returning action set from lib/actions', () => {
    // The guard no-retired-routes.test.ts uses: a glob that silently matched
    // nothing would make every assertion below pass while checking not one line.
    // updateDayNotes returns TourDateActionState, a named type, so its presence
    // proves the type resolution ran and not only the inline-error case.
    expect(actions.size).toBeGreaterThan(20)
    expect(actions.has('updateDayNotes')).toBe(true)
  })

  it('flags a bare await statement', () => {
    const fixture = `
    async function save() {
      await updateDayNotes(tourId, date, value)
    }`
    expect(flaggedActions(fixture, actions)).toContain('updateDayNotes')
  })

  it('does not flag an assigned result', () => {
    const fixture = `
    async function save() {
      const result = await updateDayNotes(tourId, date, value)
      if (result.error) show(result.error)
    }`
    expect(flaggedActions(fixture, actions)).toEqual([])
  })

  it('does not flag a call to a function outside the derived list', () => {
    const fixture = `
    async function save() {
      await someHelperThatIsNotAServerAction(value)
    }`
    expect(flaggedActions(fixture, actions)).toEqual([])
  })
})
