import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Brief 36 step 6 deleted /tours/[id]/shows and /tours/[id]/shows/[showId].
//
// The stub was the more interesting of the two. It existed only to redirect to
// the schedule, and eleven places linked to it: empty states, fallbacks, a nav
// item labelled "Shows", and two `revalidatePath` calls on a route that had no
// page to revalidate. The brief's own words for it were "every back to Shows
// link in the app is a lie".
//
// A link to a route that no longer exists is a 404 a TM meets and Claude never
// does. Nothing else in the pipeline catches it: it is a template string, so
// tsc cannot type it, and `next build` does not resolve hrefs. This test is the
// only thing standing between a stray `/shows` and a dead click.
//
// The show-scoped planner and hotel workspaces still live under that prefix and
// are still linked, deliberately, so this checks for the two retired routes
// exactly rather than for the prefix.
//
// REE-155 retired the tour-scoped Extractions queue in favour of the Inbox
// detail view (REE-154). The pattern below prevents it from being re-introduced.

const ROOTS = ['app', 'components', 'lib', 'stores', 'trigger', 'hooks']

// A route string ending at /shows, with nothing following it. Matches
// `/tours/${id}/shows` and `/tours/${tourId}/shows` but not
// `/tours/${id}/shows/${showId}/planner`.
const RETIRED_SHOWS_ROUTE = /\/tours\/\$\{[^}]+\}\/shows(?![\w/$])/

// A route string ending at /extractions, with nothing following it. Matches
// `/tours/${id}/extractions` and `/tours/${tourId}/extractions`.
const RETIRED_EXTRACTIONS_ROUTE = /\/tours\/\$\{[^}]+\}\/extractions(?![\w/$])/

const RETIRED_ROUTES = [RETIRED_SHOWS_ROUTE, RETIRED_EXTRACTIONS_ROUTE]

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

describe('the retired routes have no links left', () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))

  it('found source files to check', () => {
    // Guards the whole file. A glob that silently matched nothing would make
    // every assertion below pass while checking not one line, which is worse
    // than not having the test.
    expect(files.length).toBeGreaterThan(100)
  })

  it('has no link, redirect or revalidate pointing at retired routes', () => {
    const offenders: string[] = []

    for (const file of files) {
      // This file quotes the pattern it is looking for.
      if (file.endsWith('no-retired-routes.test.ts')) continue

      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const pattern of RETIRED_ROUTES) {
          if (pattern.test(line)) offenders.push(`${file}:${i + 1}  ${line.trim()}`)
        }
      })
    }

    expect(offenders).toEqual([])
  })

  it('still allows the show-scoped planner and hotel routes', () => {
    // The inverse case. A pattern that also caught these would pass the test
    // above by banning routes that are still live, and the failure would be a
    // TM unable to reach the planner rather than a red test.
    expect(RETIRED_SHOWS_ROUTE.test('`/tours/${tourId}/shows/${showId}/planner`')).toBe(false)
    expect(RETIRED_SHOWS_ROUTE.test('`/tours/${id}/shows/${showId}/hotels`')).toBe(false)
    expect(RETIRED_SHOWS_ROUTE.test('`/tours/${tourId}/shows`')).toBe(true)
  })

  it('still allows routes with /extractions in their names if they are not the retired route', () => {
    // The inverse case for extractions. A pattern that also caught these would pass the test
    // above by banning routes that are still live.
    expect(RETIRED_EXTRACTIONS_ROUTE.test('`/tours/${tourId}/extractions/detail`')).toBe(false)
    expect(RETIRED_EXTRACTIONS_ROUTE.test('`/tours/${tourId}/extractions`')).toBe(true)
  })
})

// REE-7: the gear menu's `documents` entry pointed at `/tours/${id}/settings`
// instead of its own route, so Documents silently landed on Settings. The old
// brief blamed SECTION_ROUTE in components/nav/sidebar.tsx, which only holds
// `schedule` and `people` and was never the culprit.
//
// `whatsapp` is deliberately not covered here: the tour settings page's Crew
// comms section (morning messages, crew Q&A) is the real WhatsApp config
// today, so that entry pointing at /settings is not the bug this guards
// against.
describe('the settings nav has no mislabelled settings link', () => {
  const panelPath = join('components', 'nav', 'tour-settings-panel.tsx')
  const source = readFileSync(panelPath, 'utf8')

  // Entries that legitimately resolve to the settings route today.
  const ALLOWED_ON_SETTINGS = ['settings', 'whatsapp']

  const SETTINGS_ROUTE = /\/tours\/\$\{[^}]+\}\/settings`/

  it('found the SETTINGS_NAV block to check', () => {
    expect(source).toMatch(/const SETTINGS_NAV = \[/)
  })

  it('has no non-settings nav entry pointing at the settings route', () => {
    const navBlockMatch = source.match(/const SETTINGS_NAV = \[([\s\S]*?)\] as const/)
    expect(navBlockMatch).not.toBeNull()
    const navBlock = navBlockMatch![1]

    const entryLines = navBlock.split('\n').filter((line) => line.trim().startsWith('{ key:'))
    expect(entryLines.length).toBeGreaterThan(0)

    const offenders: string[] = []
    for (const line of entryLines) {
      const keyMatch = line.match(/key:\s*'([^']+)'/)
      const key = keyMatch?.[1] ?? ''
      if (ALLOWED_ON_SETTINGS.includes(key)) continue
      if (SETTINGS_ROUTE.test(line)) offenders.push(line.trim())
    }

    expect(offenders).toEqual([])
  })
})
