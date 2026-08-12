import { expect, test } from '@playwright/test'
import { E2E_SEEDED_LOAD_IN_LOCAL } from '../integration/fixture'
import { testDb } from '../integration/test-db'
import { readSeed } from './seed'

// The edit-then-look-somewhere-else class. This has shipped three separate
// times: updateTourAction, updateDaySheet, and the Dates sidebar. Every one of
// them saved correctly, said "Saved.", and showed the TM the old value.
//
// Nothing else in the repo can catch it. check:conventions Rule 2 greps for a
// revalidatePath call on actions writing schedule-rendered tables, which cannot
// tell whether the path is right, and the integration suite mocks next/cache to
// a vi.fn(), so revalidate is invisible there by design.
//
// Each spec restores what it changed, or changes something no other spec reads.
// workers: 1 makes these sequential, not independent.

test('an edited load-in shows on the timeline without a reload', async ({ page }) => {
  const seed = readSeed()
  const newTime = '17:30'

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  // The timeline card itself, not the bare time. Each card renders its time
  // twice (a desktop column and a mobile inline copy), so matching on "16:00"
  // alone hits six elements and fails on strict mode. The card is a button
  // whose accessible name carries the label, which is a stable handle.
  const loadInCard = page.getByRole('button', { name: /Load-in/ }).first()

  // The seeded value, so the assertion below cannot pass on a page that never
  // showed a load-in at all.
  await expect(loadInCard).toContainText(E2E_SEEDED_LOAD_IN_LOCAL)

  await loadInCard.click()

  // Brief 42: clicking a time opens that item alone, not the twenty-field day
  // sheet. The panel's heading is the item's name, which for an untitled item is
  // its kind label, and "On this day" is its description.
  await expect(page.getByText('On this day')).toBeVisible()

  // By form field name rather than by label. The panel's time labels carry no
  // htmlFor and the input no id, so nothing associates them and getByLabel
  // cannot see them. The field name is the contract the server action reads, so
  // it is a more stable handle than either the label text or the DOM shape.
  // Worth fixing in the app for screen readers, but not in this brief.
  //
  // start_clock, not load_in: an item has one time and the kind says what the
  // time is for, which is the whole shape change. It posts a bare HH:MM because
  // the day an item belongs to is its tour_date_id, and the action builds the
  // instant once it can see the rest of the day.
  const loadIn = page.locator('input[name="start_clock"]')

  await loadIn.fill(newTime)
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  // No reload anywhere in this test. If the action stops revalidating the
  // schedule route, the panel still says "Saved." and this line goes red.
  await expect(page.getByRole('button', { name: /Load-in/ }).first()).toContainText(newTime)

  // Restore, so nothing downstream reads a time this spec invented.
  await loadIn.fill(E2E_SEEDED_LOAD_IN_LOCAL)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: /Load-in/ }).first()).toContainText(
    E2E_SEEDED_LOAD_IN_LOCAL
  )
})

// A rehearsal day, deliberately, and not the "Day off" this spec was written
// with first. Both add a day, and only one of them can catch the bug.
//
// add-day-panel.tsx calls router.refresh() after createTourDate, and refresh
// DOES re-resolve the @secondaryPanel slot: with createTourDate's
// revalidatePath deleted, this spec still passed. The rehearsal branch calls
// router.push() instead, and push does not re-resolve a layout, so there the
// server-side revalidate is the only thing that can put the day in the sidebar.
// That is also the history: createRehearsal shipped stale (it pushes) and the
// add-day path never did (it refreshes).
//
// CLAUDE.md says neither push nor refresh can re-resolve the slot. On Next
// 15.5.19 that is right about push and wrong about refresh, proved by the
// experiment above.
test('a new rehearsal day appears in the Dates sidebar without a reload', async ({ page }) => {
  const seed = readSeed()

  // A date the tour does not have, and one no other spec looks at.
  const newDate = addDays(seed.a.date, 10)

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)
  await expect(sidebarLinkFor(page, newDate)).toHaveCount(0)

  await page.getByRole('button', { name: 'Add day' }).click()
  await page.getByRole('button', { name: /Rehearsal/ }).click()

  // Scoped to the form holding the Date field: the sidebar's trigger and the
  // panel's submit button have the same accessible name, and `form` is a
  // semantic element rather than a styling hook.
  const panel = page.locator('form').filter({ has: page.getByLabel('Date') })
  await panel.getByLabel('Date').fill(newDate)
  await panel.getByLabel('Location').fill('Metropolis Studios')
  await panel.getByRole('button', { name: 'Add day' }).click()

  await expect(sidebarLinkFor(page, newDate)).toHaveCount(1)
})

test('a renamed tour updates in the sidebar and does not snap back', async ({ page }) => {
  const seed = readSeed()
  const newName = 'Renamed Mid Tour'

  await page.goto(`/tours/${seed.a.tourId}/settings`)

  await page.getByLabel('Tour name').fill(newName)
  await page.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.getByText(newName).first()).toBeVisible()

  // The React 19 case, and the reason this waits rather than asserting once. An
  // uncontrolled form is reset to its defaultValue after the action resolves,
  // on the assumption that defaultValue is what the server just sent back. If
  // the action does not revalidate, the server component still holds the old
  // name and the field visibly reverts a moment later.
  await page.waitForTimeout(1000)
  await expect(page.getByLabel('Tour name')).toHaveValue(newName)

  // Restore: access.spec.ts asserts on this tour's seeded name, and a spec that
  // leaves a renamed tour behind would make that one pass or fail on ordering.
  await page.getByLabel('Tour name').fill(seed.a.tourName)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByLabel('Tour name')).toHaveValue(seed.a.tourName)
})

// The Inbox badge (REE-151). Its whole reason to exist is the same class as the
// rest of this file, one boundary further out: the count is rendered in the app
// layout, above every route, so a resolve happening in the guest list panel (on
// the schedule route) cannot revalidate or refresh it into repainting (REE-65,
// REE-131). The badge instead reads an optimistic override written by whoever
// resolved the item (stores/inbox-count-store.ts).
//
// A /guest request normally arrives over WhatsApp or Telegram
// (handleGuestRequest, REE-133), which this suite has no channel to drive
// through a browser, so the precondition (one open attention_items row) is
// inserted directly. Everything downstream, reading the row and deciding it, is
// the browser doing what a TM would do.
//
// Cleanup is the decide step itself: approving resolves the attention item for
// good (resolved_at is set), the same way guest-list.spec.ts's soft-deleted row
// stays out of every future count. Nothing is left "requested" for a repeat run
// to trip over.
test('the Inbox badge tracks read without moving and decide without a reload', async ({ page }) => {
  const seed = readSeed()

  const { data: entry, error: entryError } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: seed.a.tourId,
      show_id: seed.a.showId,
      first_name: 'Nav',
      last_name: 'Badge',
      status: 'requested',
      request_channel: 'telegram',
      requested_by_person_id: seed.a.personId,
    })
    .select('id')
    .single()
  if (entryError || !entry) throw new Error(`could not seed guest request: ${entryError?.message}`)

  const { error: attentionError } = await testDb.from('attention_items').insert({
    tour_id: seed.a.tourId,
    kind: 'guest_request',
    title: 'Guest request: Nav Badge for Test Venue',
    related_table: 'guest_list_entries',
    related_id: entry.id,
  })
  if (attentionError) throw new Error(`could not seed attention item: ${attentionError.message}`)

  // The badge, scoped to the desktop rail's Inbox link (the mobile drawer's copy
  // is unmounted while its Sheet is closed, so this is the only one in the DOM).
  // No count in the app touches attention_items except this spec, so 1 is the
  // real total, not an assumption about ordering.
  const badge = page.locator('a[href="/inbox"] span').filter({ hasText: /^\d+$/ })

  await page.goto('/inbox')
  await expect(badge).toHaveText('1')

  await page.getByRole('button', { name: /Guest request: Nav Badge/ }).click()

  // Read is not decided: the badge counts open items, not unread ones
  // (REE-148), so marking this one read must not move it.
  await expect(badge).toHaveText('1')

  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)
  await page.getByRole('button', { name: /Guest list/ }).click()
  await page.getByRole('button', { name: 'Approve' }).click()

  // No reload anywhere past this point. Approving resolves the attention item
  // (resolveGuestRequestAttention, called from decideGuestEntry), and the badge
  // has to reflect that through the client store, not a revalidate across the
  // panel/layout boundary.
  await expect(badge).toBeHidden()
})

// Scoped to the Dates navigation landmark, which is the @secondaryPanel slot
// and the thing this spec is about. The same day links are rendered again by
// date-strip.tsx for mobile, so an unscoped locator finds two elements for one
// day and turns a passing spec into a "duplicate day" failure.
//
// Filtering by :visible instead was worse: it made the assertion depend on the
// viewport and on which of the two containers CSS happened to be showing, and
// it flipped from finding two links to finding none between runs. Counting
// inside the landmark does not care whether it is on screen.
//
// Matched by href rather than by text, because the visible text of a day row is
// a number and a month abbreviation, and those repeat across a tour.
function sidebarLinkFor(page: import('@playwright/test').Page, date: string) {
  return page.getByRole('navigation', { name: 'Dates' }).locator(`a[href*="date=${date}"]`)
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
