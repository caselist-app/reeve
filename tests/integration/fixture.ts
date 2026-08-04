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
  contactId: string
  personId: string
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

  // A crew member on this tour. Needed so a cross-tour test can pass a *valid*
  // id for every argument except the one under test: without that, a test can
  // pass because the wrong check fired, which is worse than no test.
  const { data: contact, error: contactError } = await testDb
    .from('contacts')
    .insert({ account_id: userId, name: 'Test Crew' })
    .select('id')
    .single()
  if (contactError || !contact) throw new Error(`fixture: could not create contact: ${contactError?.message}`)

  const { data: person, error: personError } = await testDb
    .from('people')
    .insert({ tour_id: tour.id, contact_id: contact.id, person_type: 'crew' })
    .select('id')
    .single()
  if (personError || !person) throw new Error(`fixture: could not create person: ${personError?.message}`)

  setTestUserId(userId)

  return {
    userId,
    tourId: tour.id,
    tourDateId: tourDate.id,
    showId: show.id,
    contactId: contact.id,
    personId: person.id,
    date,
  }
}

// Deleting the auth user cascades to accounts, and accounts cascades to tours,
// and every tour-scoped table cascades from there. One delete is the whole
// teardown.
export async function destroyFixture(fixture: Fixture) {
  await testDb.auth.admin.deleteUser(fixture.userId)
}

// A second tour on the SAME account. This is the shape the cross-tour bugs
// actually take: RLS passes on both tours because one TM owns both, and the
// only thing standing between tour B's data and tour A's crew is an explicit
// check in the action. A second account would be caught by RLS and would
// therefore test nothing.
export async function createSecondTour(fixture: Fixture, date = '2026-07-01') {
  const { data: artist } = await testDb
    .from('artists')
    .insert({ account_id: fixture.userId, name: 'Other Artist' })
    .select('id')
    .single()
  if (!artist) throw new Error('fixture: could not create second artist')

  const { data: tour } = await testDb
    .from('tours')
    .insert({
      account_id: fixture.userId,
      artist_id: artist.id,
      name: 'Other Tour',
      timezone: 'Europe/London',
    })
    .select('id')
    .single()
  if (!tour) throw new Error('fixture: could not create second tour')

  const { data: tourDate } = await testDb
    .from('tour_dates')
    .insert({ tour_id: tour.id, date, day_type: 'show' })
    .select('id')
    .single()
  if (!tourDate) throw new Error('fixture: could not create second tour_date')

  const { data: show } = await testDb
    .from('shows')
    .insert({
      tour_id: tour.id,
      tour_date_id: tourDate.id,
      date,
      venue_name: 'Other Venue',
    })
    .select('id')
    .single()
  if (!show) throw new Error('fixture: could not create second show')

  // people.contact_id is required: identity lives on the account-level contact,
  // and people is the per-tour membership row.
  const { data: contact } = await testDb
    .from('contacts')
    .insert({ account_id: fixture.userId, name: 'Other Crew' })
    .select('id')
    .single()
  if (!contact) throw new Error('fixture: could not create second contact')

  const { data: person } = await testDb
    .from('people')
    .insert({ tour_id: tour.id, contact_id: contact.id, person_type: 'crew' })
    .select('id')
    .single()
  if (!person) throw new Error('fixture: could not create second person')

  return { tourId: tour.id, tourDateId: tourDate.id, showId: show.id, personId: person.id, date }
}
