// Every number about this repo that a document might otherwise state and get
// wrong. Run by `pnpm facts`.
//
// Why this exists: on 2026-08-11 an audit of the three Reeve agent skills found
// the same handful of numbers written down in four places and the same handful
// of operational facts in five, several of them stale by days. A number written
// into prose is a number that will be wrong, because nothing tells you when it
// moves. So no document states one. Documents point here, and this computes it.
//
// It computes and prints. It does not write anywhere, deliberately: the first
// version of this file kept a generated block inside OPERATIONS.md and had
// check:conventions fail when the committed copy fell behind. That was the same
// mistake in a smaller box. A committed block is still a number written down,
// and it went stale the same day, because a pull request adding one test file
// turned main red without ever touching OPERATIONS.md. A number is computed at
// the moment it is needed or it is not trustworthy.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

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
      label: 'conventions-baseline.json entries',
      value: baselineTotal,
      detail: byGroup.map(([n, c]) => `${c} ${n}`).join(', ') || 'empty',
      note: 'Should only ever shrink. A new entry added to make a build pass is a defect.',
    },
    {
      label: 'check:conventions rules',
      value: (conventions.match(/^\/\/ ---- Rule/gm) ?? []).length,
      note: 'Run them with pnpm check:conventions.',
    },
    {
      label: 'unit test files',
      value: countMatching('tests/unit', /\.test\.ts$/),
      note: 'pnpm test. No Docker, so this is the one suite Matt can run himself.',
    },
    {
      label: 'integration test files',
      value: countMatching('tests/integration', /\.test\.ts$/),
      note: 'pnpm test:integration. Needs real Postgres, so CI only.',
    },
    {
      label: 'e2e spec files',
      value: countMatching('tests/e2e', /\.spec\.ts$/),
      note: 'pnpm test:e2e. Real browser against a real build, so CI only.',
    },
    {
      label: 'migrations',
      value: countMatching('supabase/migrations', /\.sql$/),
      note: 'Matt runs every one of them. Write them, never apply them.',
    },
    {
      label: 'env vars marked [BOTH]',
      value: (envExample.match(/\[BOTH\]/g) ?? []).length,
      note: 'Read by job code, so they must be set in Trigger.dev as well as Vercel.',
    },
  ]
}

export function render(facts = computeFacts()) {
  const width = Math.max(...facts.map((f) => f.label.length))
  const rows = facts.map((f) => {
    const detail = f.detail ? `  (${f.detail})` : ''
    return `  ${f.label.padEnd(width)}  ${String(f.value).padStart(3)}${detail}`
  })
  const notes = facts.filter((f) => f.note).map((f) => `  ${f.label}\n    ${f.note}`)
  return ['', ...rows, '', ...notes, ''].join('\n')
}

if (process.argv[1] && process.argv[1].endsWith('facts.mjs')) {
  console.log(render())
}
