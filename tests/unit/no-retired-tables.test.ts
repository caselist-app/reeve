import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// REE-23 dropped day_sheets and day_events. This is the guard that keeps them
// gone from the source, and it exists because the compiler cannot.
//
// A dropped table removed from lib/types/database.ts turns every typed
// `.from('day_sheets')` into a compile error, which is a real guard. It is not
// the whole guard. A PostgREST embed names the table with neither `.from()` nor
// a typed helper: `shows(day_sheets(load_in))` is a plain string, and
// trigger/jobs/boarding-pass.ts sat for four commits reading a stale load-in
// through exactly that shape while every grep for a typed access came back
// clean. So this searches the bare table name, not `from('day_sheets')`, which
// is the only thing that catches an embed.
//
// The scan is deliberately over comments as well as code: a comment naming a
// live table is a map to a place that no longer exists, and the alternative
// (match query usage only) would let the string survive in prose that the next
// reader trusts. REE-23 scrubbed every such comment in the same commit rather
// than narrow the search.
//
// tests/ is in scope on purpose. The scope that shipped Brief 42 was app/,
// components/, lib/ and trigger/, and that is exactly the scope that missed the
// e2e seed and the fixture, both of which write these tables from tests/.

const ROOTS = ['app', 'components', 'lib', 'trigger', 'tests']

// The bare relation names, nothing more. An embed, a typed access, a raw
// PostgREST URL and a comment all contain one of these, which is the point.
const RETIRED_TABLES = ['day_sheets', 'day_events']

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path))
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path)
  }
  return out
}

describe('the retired day tables have no references left', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))

  it('found source files to check', () => {
    // Guards the whole file. A glob that silently matched nothing would make
    // every assertion below pass while checking not one line.
    expect(files.length).toBeGreaterThan(100)
  })

  it('names neither day_sheets nor day_events anywhere in app, components, lib, trigger or tests', () => {
    const offenders: string[] = []

    for (const file of files) {
      // This file quotes the names it is looking for.
      if (file.endsWith('no-retired-tables.test.ts')) continue

      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const table of RETIRED_TABLES) {
          if (line.includes(table)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('would catch an embed, a typed access and a comment', () => {
    // The inverse case, so a matcher that quietly stopped matching would fail
    // here rather than pass the scan above by checking nothing. All three shapes
    // are how these names actually appear in this codebase's history.
    const matches = (line: string) => RETIRED_TABLES.some((t) => line.includes(t))

    expect(matches('.select(`shows(day_sheets(load_in))`)')).toBe(true)
    expect(matches("await db.from('day_events').insert({})")).toBe(true)
    expect(matches('// the old day_sheets row is gone')).toBe(true)
    expect(matches('const dayItems = await fetchDayItems()')).toBe(false)
  })
})
