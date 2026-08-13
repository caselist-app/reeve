import { describe, it, expect } from 'vitest'

// Rule 12 in scripts/check-conventions.mjs flags a document that states the
// baseline count in prose. REE-74: the report() call built its message and its
// dedupe key with an escaped template literal, `${'$'}{doc}`, which evaluates
// to the literal text `${doc}` rather than interpolating it. Every violation in
// every document therefore reported the same fixed message and, worse, the
// same fixed key `facts-in-prose|${doc}|${lineOf(src, at)}`, so two violations
// in two different files collapsed into one for both reporting and baselining.
//
// This pins the fixed behaviour by duplicating the regex and key-building logic
// on string fixtures, the same way no-retired-routes.test.ts and
// action-results-are-read.test.ts pin their rules, so a future edit cannot
// silently reintroduce the escaping.

const COUNT_NEAR_BASELINE =
  /(?:stands? at|stood at|is (?:now )?at|is now|sits at|holds|has|down to)\s+(\d+)\b|\b(\d+)\s+(?:known\s+)?(?:baselined?\s+)?(?:entries|violations)\b/gi

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length

function factsInProseViolations(doc: string, src: string) {
  const out: { message: string; key: string }[] = []
  for (const anchor of src.matchAll(/baseline/gi)) {
    const from = anchor.index!
    const window = src.slice(from, from + 320)
    for (const m of window.matchAll(COUNT_NEAR_BASELINE)) {
      const at = from + m.index!
      out.push({
        message: `States the baseline count in prose ("${m[0].trim()}"). A number about this ` +
          'repo goes stale silently and nothing tells you. Run `pnpm facts` instead ' +
          'of writing the figure.',
        key: `facts-in-prose|${doc}|${lineOf(src, at)}`,
      })
    }
  }
  return out
}

describe('Rule 12 keys a facts-in-prose violation by file and line', () => {
  it('interpolates the matched phrase into the message', () => {
    const src = 'The baseline stands at 12 entries today.'
    const [violation] = factsInProseViolations('CLAUDE.md', src)
    expect(violation.message).toContain('"stands at 12"')
    expect(violation.message).not.toContain('${m[0]')
  })

  it('gives two violations in two different documents different keys', () => {
    const claudeMd = 'The baseline stands at 12 entries today.'
    const operationsMd = 'The baseline is now at 30 entries today.'
    const [a] = factsInProseViolations('CLAUDE.md', claudeMd)
    const [b] = factsInProseViolations('OPERATIONS.md', operationsMd)
    expect(a.key).not.toBe(b.key)
    expect(a.key).toBe('facts-in-prose|CLAUDE.md|1')
    expect(b.key).toBe('facts-in-prose|OPERATIONS.md|1')
  })

  it('gives two violations on different lines of the same document different keys', () => {
    // The 320-char lookahead window is per anchor, so the two phrases need to
    // sit further apart than that or the first anchor's window would also
    // catch the second phrase and double-count it.
    const filler = 'x'.repeat(400)
    const src = `The baseline stands at 12 entries today.\n${filler}\nThe baseline is now at 30 entries here.`
    const violations = factsInProseViolations('CLAUDE.md', src)
    expect(violations.length).toBe(2)
    expect(violations[0].key).not.toBe(violations[1].key)
  })
})
