import { testDb, setTestUserId } from './setup'

// One tour, one show day, one show, one empty day sheet. Built by direct insert
// rather than through create_show_with_dependents, because that RPC gates on
// owns_tour() and therefore on auth.uid(), which a service-role client does not
// have. The shape it produces is the same.
//
// Every fixture gets its own account and tour, so one test cannot see another's
// rows and a failure points at one test rather than at ordering.

export interface Fixture {
  userId: string
  tourId: string
  tourDateId: string
  showId: string
  date: string
}

export async function createFixture(opts: { date?: string; timezone?: string } = {}): Promise<Fixture> {
  const date = opts.date ?? '2026-06-14'
  const stamp = Date.now()

  const { data: user, error: userError } = await testDb.auth.admin.createUser({
    email: `test-${stamp}-${Math.random().toString(36).slice(2)}@example.test`,
    password: 'test-password-not-a-real-secret',
    email_confirm: true,
  })
  if (userError || !user.user) throw new Error(`fixture: could not create user: ${userError?.message}`)

  const userId = user.user.id

  const { error: accountError } = await testDb
    .from('accounts')
    .insert({ id: userId, name: 'Test TM', email: `test-${stamp}@example.test` })
  if (accountError) throw new Error(`fixture: could not create account: ${accountError.message}`)

  const { data: artist, error: artistError } = await testDb
    .from('artists')
    .insert({ account_id: userId, name: 'Test Artist' })
    .select('id')
    .single()
  if (artistError || !artist) throw new Error(`fixture: could not create artist: ${artistError?.message}`)

  const { data: tour, error: tourError } = await testDb
    .from('tours')
    .insert({
      account_id: userId,
      artist_id: artist.id,
      name: 'Test Tour',
      timezone: opts.timezone ?? 'Europe/London',
    })
    .select('id')
    .single()
  if (tourError || !tour) throw new Error(`fixture: could not create tour: ${tourError?.message}`)

  const { data: tourDate, error: tourDateError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: tour.id, date, day_type: 'show' })
    .select('id')
    .single()
  if (tourDateError || !tourDate) {
    throw new Error(`fixture: could not create tour_date: ${tourDateError?.message}`)
  }

  const { data: show, error: showError } = await testDb
    .from('shows')
    .insert({
      tour_id: tour.id,
      tour_date_id: tourDate.id,
      date,
      venue_name: 'Test Venue',
    })
    .select('id')
    .single()
  if (showError || !show) throw new Error(`fixture: could not create show: ${showError?.message}`)

  // create_show_with_dependents always inserts an empty day_sheets row, so the
  // fixture matches production: the row exists with every time column null.
  const { error: daySheetError } = await testDb
    .from('day_sheets')
    .insert({ show_id: show.id, tour_id: tour.id })
  if (daySheetError) throw new Error(`fixture: could not create day_sheet: ${daySheetError.message}`)

  setTestUserId(userId)

  return { userId, tourId: tour.id, tourDateId: tourDate.id, showId: show.id, date }
}

// Deleting the auth user cascades to accounts, and accounts cascades to tours,
// and every tour-scoped table cascades from there. One delete is the whole
// teardown.
export async function destroyFixture(fixture: Fixture) {
  await testDb.auth.admin.deleteUser(fixture.userId)
}
