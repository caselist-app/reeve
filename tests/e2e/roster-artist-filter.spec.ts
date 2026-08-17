import { expect, test } from '@playwright/test'
import { testDb } from '../integration/test-db'
import { readSeed } from './seed'

// Brief 29, step 3 (REE-235). The roster page filtered only by account_id
// (Brief 20), so a TM with two artists saw both artists' crew merged into one
// list with no way to tell them apart. This proves the filter pills, the
// ?artist= URL param, and the "Unassigned" bucket for a contact with zero
// contact_artists rows, the three things REE-233/REE-234 (the migration, the
// auto-link, and the contact-sheet Artists checklist) do not themselves cover.
//
// Seeds its own artist and contacts rather than reusing the global seed's
// account A data, so assertions can target rows by name instead of by count:
// the roster page lists every contact on the account and other specs share
// this account (workers: 1, fullyParallel: false rules out a concurrent
// write, but not a leftover row from an earlier spec in the file order).
test('the roster page filters by artist and surfaces an Unassigned bucket', async ({ page }) => {
  const seed = readSeed()
  const stamp = Date.now()

  const { data: secondArtist, error: artistError } = await testDb
    .from('artists')
    .insert({ account_id: seed.a.userId, name: `E2E Filter Artist ${stamp}` })
    .select('id, name')
    .single()
  if (artistError || !secondArtist) {
    throw new Error(`could not create second artist: ${artistError?.message}`)
  }

  const linkedName = `E2E Linked Contact ${stamp}`
  const unassignedName = `E2E Unassigned Contact ${stamp}`

  const { data: linkedContact, error: linkedError } = await testDb
    .from('contacts')
    .insert({ account_id: seed.a.userId, name: linkedName })
    .select('id')
    .single()
  if (linkedError || !linkedContact) {
    throw new Error(`could not create linked contact: ${linkedError?.message}`)
  }

  const { data: unassignedContact, error: unassignedError } = await testDb
    .from('contacts')
    .insert({ account_id: seed.a.userId, name: unassignedName })
    .select('id')
    .single()
  if (unassignedError || !unassignedContact) {
    throw new Error(`could not create unassigned contact: ${unassignedError?.message}`)
  }

  const { error: linkError } = await testDb
    .from('contact_artists')
    .insert({ contact_id: linkedContact.id, artist_id: secondArtist.id })
  if (linkError) throw new Error(`could not link contact to artist: ${linkError.message}`)

  try {
    await page.goto('/roster')

    // Defaults to all contacts: both the second-artist-only contact and the
    // zero-link contact are visible with no filter applied.
    await expect(page.getByText(linkedName)).toBeVisible()
    await expect(page.getByText(unassignedName)).toBeVisible()

    // Pills exist for "All artists", every artist on the account (the global
    // seed's "Seeded Artist" and this test's new artist), and "Unassigned".
    const allPill = page.getByRole('link', { name: 'All artists' })
    const artistPill = page.getByRole('link', { name: secondArtist.name, exact: true })
    const unassignedPill = page.getByRole('link', { name: 'Unassigned', exact: true })
    await expect(allPill).toBeVisible()
    await expect(artistPill).toBeVisible()
    await expect(unassignedPill).toBeVisible()

    // Selecting the artist pill filters the list to only that artist's
    // contacts and updates the URL.
    await artistPill.click()
    await expect(page).toHaveURL(`/roster?artist=${secondArtist.id}`)
    await expect(page.getByText(linkedName)).toBeVisible()
    await expect(page.getByText(unassignedName)).toBeHidden()

    // Selecting "Unassigned" shows the zero-link contact and hides the
    // artist-linked one.
    await unassignedPill.click()
    await expect(page).toHaveURL('/roster?artist=unassigned')
    await expect(page.getByText(unassignedName)).toBeVisible()
    await expect(page.getByText(linkedName)).toBeHidden()

    // Back to "All artists" shows both again.
    await allPill.click()
    await expect(page).toHaveURL('/roster')
    await expect(page.getByText(linkedName)).toBeVisible()
    await expect(page.getByText(unassignedName)).toBeVisible()
  } finally {
    // Cascades away contact_artists; the artist and contacts are the only
    // rows left to remove explicitly.
    await testDb.from('contacts').delete().eq('id', linkedContact.id)
    await testDb.from('contacts').delete().eq('id', unassignedContact.id)
    await testDb.from('artists').delete().eq('id', secondArtist.id)
  }
})
