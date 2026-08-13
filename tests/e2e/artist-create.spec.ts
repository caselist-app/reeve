import { expect, test } from '@playwright/test'
import { testDb } from '../integration/test-db'
import { readSeed } from './seed'

// REE-163: adding a second (or later) artist from the workspace nav never
// provisioned a receive email address. The standalone /artists/new form (the
// only entry point components/nav/tour-selector.tsx links "add artist" to)
// renders the derived slug in an input that was both readOnly and disabled.
// A disabled control is not a "successful control" per the HTML spec, so the
// browser drops it from the submitted FormData entirely: the server action
// always saw slug as undefined, inserted the artist with slug = null, and
// silently skipped provisionTourEmailDomain. The inline "+ New artist" flow
// inside new-tour-form.tsx was never affected, because it builds FormData in
// JS from React state instead of reading the (also disabled) DOM input, which
// is why this only ever showed up for an artist added after the first.
//
// This only proves the slug reaches the row, not that Resend/Cloudflare
// actually provision, since e2e has no real Resend credentials. Losing the
// slug is the reproducible part of the bug; provisioning is a network call
// gated on the slug being there at all.
test('creating an artist from the workspace nav saves its slug', async ({ page }) => {
  const seed = readSeed()
  const artistName = 'E2E Nav Artist'

  // Not asserted on repeat runs colliding: cleaned up at the end below, and
  // the slug is globally unique, so a leftover row from a previous failed
  // run would make this fail loudly rather than pass by accident.
  await page.goto('/artists/new')
  await page.getByLabel('Artist name').fill(artistName)
  await page.getByRole('button', { name: 'Create artist' }).click()

  await expect(page).toHaveURL('/tours/new')

  const { data: artist, error } = await testDb
    .from('artists')
    .select('id, slug')
    .eq('account_id', seed.a.userId)
    .eq('name', artistName)
    .single()

  if (error || !artist) throw new Error(`artist row was not created: ${error?.message}`)

  expect(artist.slug).toBe('e2e-nav-artist')

  await testDb.from('artists').delete().eq('id', artist.id)
})
