// Every number about this repo that a document might otherwise state and get
// wrong. Run by `pnpm facts`.
//
// Why this exists: on 2026-08-11 an audit of the three Reeve agent skills found
// the same handful of numbers written down in four places and the same handful
// of operational facts in five, several of them stale by days. A number written
// into prose is a number that will be wrong, because nothing tells you when it
// moves. So no document states one. Documents point here, and this computes it.
//
// OPERATIONS.md carries a generated block between the FACTS markers.
// `pnpm facts --write` regenerates it and `pnpm check:conventions` fails when
// the committed block has fallen behind, the same way a lockfile check works.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const BEGIN = '<!-- FACTS:BEGIN -->'
export const END = '<!-- FACTS:END -->'
export const OPERATIONS_PATH = join(ROOT, 'OPERATIONS.md')

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const listDir = (p) => (existsSync(join(ROOT, p)) ? readdirSync(join(ROOT, p)) : [])
const countMatching = (dir, re) => listDir(dir).filter((f) => re.test(f)).length

export function computeFacts() {
  const baseline = JSON.parse(read('scripts/conventions-baseline.json'))
  const groups = Object.entries(baseline).filter(([k]) => k !== '_readme')
  const sizeOf = (v) => (Array.isArray(v) ? v.length : Object.keys(v).length)
  const byGroup = groups.map(([name, v]) => [name, sizeOf(v)])
  const baselineTotal = byGroup.reduce((n, [, c]) => n + c, 0)

  const conventions = read('scripts/check-conventions.mjs')
  const envExample = read('.env.example')

  return [
    {
      key: 'baseline',
      label: 'conventions-baseline.json entries',
      value: baselineTotal,
      detail: byGroup.map(([n, c]) => `${c} ${n}`).join(', ') || 'empty',
      note: 'Should only ever shrink. A new entry added to make a build pass is a defect.',
    },
    {
      key: 'convention-rules',
      label: 'check:conventions rules',
      value: (conventions.match(/^\/\/ ---- Rule/gm) ?? []).length,
      note: 'Run them with pnpm check:conventions.',
    },
    {
      key: 'unit-tests',
      label: 'unit test files',
      value: countMatching('tests/unit', /\.test\.ts$/),
      note: 'pnpm test. No Docker, so this is the one suite Matt can run himself.',
    },
    {
      key: 'integration-tests',
      label: 'integration test files',
      value: countMatching('tests/integration', /\.test\.ts$/),
      note: 'pnpm test:integration. Needs real Postgres, so CI only.',
    },
    {
      key: 'e2e-specs',
      label: 'e2e spec files',
      value: countMatching('tests/e2e', /\.spec\.ts$/),
      note: 'pnpm test:e2e. Real browser against a real build, so CI only.',
    },
    {
      key: 'migrations',
      label: 'migrations',
      value: countMatching('supabase/migrations', /\.sql$/),
      note: 'Matt runs every one of them. Write them, never apply them.',
    },
    {
      key: 'both-env-vars',
      label: 'env vars marked [BOTH]',
      value: (envExample.match(/\[BOTH\]/g) ?? []).length,
      note: 'Read by job code, so they must be set in Trigger.dev as well as Vercel.',
    },
  ]
}

export function factsBlock(facts = computeFacts()) {
  const width = Math.max(...facts.map((f) => f.label.length))
  const lines = facts.map((f) => {
    const detail = f.detail ? `  (${f.detail})` : ''
    return `${f.label.padEnd(width)}  ${String(f.value).padStart(3)}${detail}`
  })
  return [
    BEGIN,
    '',
    '```',
    ...lines,
    '```',
    '',
    ...facts.filter((f) => f.note).map((f) => `- **${f.label}.** ${f.note}`),
    '',
    END,
  ].join('\n')
}

/** Returns null when OPERATIONS.md is current, or a message saying why not. */
export function checkOperationsBlock() {
  if (!existsSync(OPERATIONS_PATH)) return 'OPERATIONS.md is missing.'
  const src = readFileSync(OPERATIONS_PATH, 'utf8')
  const start = src.indexOf(BEGIN)
  const end = src.indexOf(END)
  if (start === -1 || end === -1) {
    return `OPERATIONS.md has no ${BEGIN} ... ${END} block.`
  }
  const current = src.slice(start, end + END.length)
  const expected = factsBlock()
  if (current === expected) return null
  return 'The generated facts block in OPERATIONS.md is out of date. Run `pnpm facts --write`.'
}

function write() {
  const src = readFileSync(OPERATIONS_PATH, 'utf8')
  const start = src.indexOf(BEGIN)
  const end = src.indexOf(END)
  if (start === -1 || end === -1) {
    console.error(`OPERATIONS.md has no ${BEGIN} ... ${END} block to write into.`)
    process.exit(1)
  }
  const next = src.slice(0, start) + factsBlock() + src.slice(end + END.length)
  if (next === src) {
    console.log('OPERATIONS.md is already current.')
    return
  }
  writeFileSync(OPERATIONS_PATH, next)
  console.log('OPERATIONS.md facts block updated.')
}

if (process.argv[1] && process.argv[1].endsWith('facts.mjs')) {
  if (process.argv.includes('--write')) write()
  else console.log(factsBlock())
}
