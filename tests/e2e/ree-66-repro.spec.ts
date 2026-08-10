import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-66 reproduction harness. THROWAWAY: this spec exists only to run under
// --repeat-each and prove (or disprove) that a newly added day intermittently
// fails to appear in the Dates sidebar without a reload. It is not meant to
// merge. See the PR description and the Linear issue.
//
// Why repeat-each and not a single run: the reported failure is intermittent,
// and CLAUDE.md's REE-65 rule is explicit that one green run of an intermittent
// bug proves nothing (a 1-in-5 flake passes a single run 80% of the time). Each
// iteration here uses a UNIQUE date derived from test.info().repeatEachIndex, so
// the run is genuinely repeat-safe: no iteration collides with a day a previous
// iteration already created, which is the harness trap the existing
// revalidate.spec.ts rehearsal test would hit under --repeat-each (it reuses one
// fixed date and would fail every repeat after the first for a non-product
// reason).
//
// Two paths are covered, the two that do NOT call Trigger.dev from their server
// action:
//   - Rehearsal: createRehearsal (revalidatePath) + client router.push(). push
//     does not re-resolve the @secondaryPanel layout, so the server revalidate
//     is the only thing that can put the day in the sidebar.
//   - Day off: createTourDate (revalidatePath) + client router.refresh(). Both
//     mechanisms fire, which is the "mixing double-render" CLAUDE.md warns about
//     and the two-concurrent-RSC-payloads race that REE-65 was.
//
// The show path is deliberately absent: createShow awaits resolveHubJob.trigger()
// (lib/actions/shows.ts:75), which needs TRIGGER_SECRET_KEY. That is unset in CI,
// so a show added through the UI would fail before it reached the sidebar, for a
// reason unrelated to this bug. That path also has NO revalidatePath at all and
// is analysed separately in the issue.

// Distinct base offsets per path so the two tests never target the same date on
// the same repeat index. 25 repeats stays well inside each 60-day band.
const REHEARSAL_BASE = 60
const DAY_OFF_BASE = 200

// Matched by href rather than by the row's visible text (a day number plus a
// month abbreviation, which repeat across a tour), and scoped to the Dates
// navigation landmark because date-strip.tsx renders the same links again for
// mobile. Copied from revalidate.spec.ts on purpose: same handle, same guard.
function sidebarLinkFor(page: import('@playwright/test').Page, date: string) {
  return page.getByRole('navigation', { name: 'Dates' }).locator(`a[href*="date=${date}"]`)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

test('a new rehearsal day appears in the Dates sidebar without a reload (push path)', async ({
  page,
}, testInfo) => {
  const seed = readSeed()
  const newDate = addDays(seed.a.date, REHEARSAL_BASE + testInfo.repeatEachIndex)

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(0)

  await page.getByRole('button', { name: 'Add day' }).click()
  await page.getByRole('button', { name: /Rehearsal/ }).click()

  const panel = page.locator('form').filter({ has: page.getByLabel('Date') })
  await panel.getByLabel('Date').fill(newDate)
  await panel.getByLabel('Location').fill('Metropolis Studios')
  await panel.getByRole('button', { name: 'Add day' }).click()

  // The whole assertion. If the sidebar stays stale (the reported bug), this
  // link never appears on a soft navigation and the test times out.
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(1)
})

test('a new day off appears in the Dates sidebar without a reload (refresh path)', async ({
  page,
}, testInfo) => {
  const seed = readSeed()
  const newDate = addDays(seed.a.date, DAY_OFF_BASE + testInfo.repeatEachIndex)

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(0)

  await page.getByRole('button', { name: 'Add day' }).click()
  await page.getByRole('button', { name: /Day off/ }).click()

  const panel = page.locator('form').filter({ has: page.getByLabel('Date') })
  await panel.getByLabel('Date').fill(newDate)
  await panel.getByRole('button', { name: 'Add day' }).click()

  await expect(sidebarLinkFor(page, newDate)).toHaveCount(1)
})
