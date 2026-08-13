import { expect, test } from '@playwright/test'
import { readSeed } from './seed'

// REE-180. The Roster section (crew avatars) is gone from the desktop day
// info panel, and the remaining sections now read Venue, Guest list, Notes,
// Hotel top to bottom. This is exactly the "deleting a list also deletes
// whatever was riding on one of its entries" shape CLAUDE.md warns about, so
// this pins both halves: the order of what remains, and that Roster is
// actually gone rather than just moved.
//
// Scoped to the day-info-panel testid rather than the whole page: the
// account-level sidebar nav has its own, unrelated "Roster" link (People
// page, still labelled Roster in code) that is visible on every route, so a
// page-wide assertion would fail for a reason that has nothing to do with
// this panel.
//
// The mobile dock is untouched by REE-180 and keeps its own "N people on
// this day" line, so this spec only opens the desktop layout (Playwright's
// default Desktop Chrome viewport, which is above the lg breakpoint).

test('the desktop day info panel reads Venue, Guest list, Notes, Hotel and has no Roster', async ({
  page,
}) => {
  const seed = readSeed()

  // The seeded show day: a show (Venue + Guest list), a same-day hotel stay
  // (Hotel), and day notes are always rendered (Notes). All four sections are
  // present, so the order assertion below is meaningful.
  await page.goto(`/tours/${seed.a.tourId}/schedule?date=${seed.a.date}`)

  const panel = page.getByTestId('day-info-panel')
  await expect(panel).toBeVisible()

  const venue = panel.getByText('Venue', { exact: true })
  const guestList = panel.getByRole('button', { name: /Guest list/ })
  const notes = panel.getByText('Notes', { exact: true })
  const hotel = panel.getByText('Hotel', { exact: true })

  await expect(venue).toBeVisible()
  await expect(guestList).toBeVisible()
  await expect(notes).toBeVisible()
  await expect(hotel).toBeVisible()

  const [venueBox, guestListBox, notesBox, hotelBox] = await Promise.all([
    venue.boundingBox(),
    guestList.boundingBox(),
    notes.boundingBox(),
    hotel.boundingBox(),
  ])
  if (!venueBox || !guestListBox || !notesBox || !hotelBox) {
    throw new Error('one of the day info sections did not render a box to compare positions')
  }

  expect(venueBox.y).toBeLessThan(guestListBox.y)
  expect(guestListBox.y).toBeLessThan(notesBox.y)
  expect(notesBox.y).toBeLessThan(hotelBox.y)

  await expect(panel.getByText('Roster')).toHaveCount(0)
})
