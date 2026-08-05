import { testDb, setTestUserId } from './test-db'

// One tour, one show day, one show, one empty day sheet. Built by direct insert
// rather than through create_show_with_dependents, because that RPC gates on
// owns_tour() and therefore on auth.uid(), which a service-role client does not
// have. The shape it produces is the same.
//
// Every fixture gets its own account and tour, so one test cannot see another's
// rows and a failure points at one test rather than at ordering.

export interface Fixture {
  userId: string
  // The account's login email. The e2e suite signs in as this account through
  // the dev login route, which takes an email and nothing else.
  email: string
  artistId: string
  tourId: string
  tourName: string
  tourDateId: string
  showId: string
  contactId: string
  personId: string
  date: string
}

export async function createFixture(
  opts: { date?: string; timezone?: string; tourName?: string; artistName?: string } = {}
): Promise<Fixture> {
  const date = opts.date ?? '2026-06-14'
  const tourName = opts.tourName ?? 'Test Tour'
  const stamp = Date.now()

  const email = `test-${stamp}-${Math.random().toString(36).slice(2)}@example.test`

  const { data: user, error: userError } = await testDb.auth.admin.createUser({
    email,
    password: 'test-password-not-a-real-secret',
    email_confirm: true,
  })
  if (userError || !user.user) throw new Error(`fixture: could not create user: ${userError?.message}`)

  const userId = user.user.id

  const { error: accountError } = await testDb
    .from('accounts')
    .insert({ id: userId, name: 'Test TM', email })
  if (accountError) throw new Error(`fixture: could not create account: ${accountError.message}`)

  const { data: artist, error: artistError } = await testDb
    .from('artists')
    .insert({ account_id: userId, name: opts.artistName ?? 'Test Artist' })
    .select('id')
    .single()
  if (artistError || !artist) throw new Error(`fixture: could not create artist: ${artistError?.message}`)

  const { data: tour, error: tourError } = await testDb
    .from('tours')
    .insert({
      account_id: userId,
      artist_id: artist.id,
      name: tourName,
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
    email,
    artistId: artist.id,
    tourId: tour.id,
    tourName,
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

// Tour names the e2e specs assert on. Deliberately unalike, and deliberately
// not "Test Tour": the cross-account spec proves account A cannot see account
// B's tour name, and two similar names would let a substring match pass by
// accident.
export const E2E_TOUR_A_NAME = 'Northern Lights Tour'
export const E2E_TOUR_B_NAME = 'Harbour Sessions Tour'

// A load-in on account A's show day, so the revalidate spec has a time to edit
// and the day timeline has a card to click. Set here rather than in
// createFixture, because the integration tests assert on a day with no items and
// a default time would quietly change what they are testing.
//
// The tour is Europe/London and the seeded date is in June, so 15:00Z renders
// as 16:00 on the timeline. Both are exported so the spec asserts the value it
// seeded rather than a number written twice.
export const E2E_SEEDED_LOAD_IN_UTC = 'T15:00:00Z'
export const E2E_SEEDED_LOAD_IN_LOCAL = '16:00'

export interface E2eSeed {
  // The account the browser signs in as. Everything the smoke specs open hangs
  // off this one.
  a: Fixture & {
    hotelStayId: string
    rehearsalId: string
    rehearsalDate: string
  }
  // A second ACCOUNT, not a second tour. createSecondTour puts both tours on
  // one account, which is right for cross-tour id checks and proves nothing
  // about RLS, because RLS passes when one TM owns both. Account B is the only
  // way to test the thing RLS actually does.
  b: Fixture
}

// The data the whole e2e suite runs against. Built once in globalSetup rather
// than per spec: these tests read pages far more than they write rows, and a
// per-spec account would mean signing in again for every file.
//
// The hotel stay and the rehearsal exist for one reason each: they are the only
// way to reach /tours/[id]/shows/[showId]/hotels/[stayId] and
// /tours/[id]/rehearsals/[rehearsalId], and a smoke spec that skips a route
// because it could not build an id is a smoke spec with a hole in it.
export async function createE2eSeed(): Promise<E2eSeed> {
  const a = await createFixture({ tourName: E2E_TOUR_A_NAME, artistName: 'Seeded Artist' })
  const b = await createFixture({ tourName: E2E_TOUR_B_NAME, artistName: 'Other Artist' })

  // A day_items row since Brief 42, not a day_sheets column. Inserted directly
  // rather than through createDayItem because this runs in Playwright's global
  // setup, which is plain Node with no mocked requireUser, and a server action
  // needs one. The instant is written straight in for the same reason: the
  // action's roll-over resolution is what would otherwise derive it, and this is
  // a daytime time on an otherwise empty day, so there is nothing to resolve.
  const { error: loadInError } = await testDb.from('day_items').insert({
    tour_id: a.tourId,
    tour_date_id: a.tourDateId,
    show_id: a.showId,
    kind: 'load_in',
    starts_at: `${a.date}${E2E_SEEDED_LOAD_IN_UTC}`,
  })
  if (loadInError) throw new Error(`seed: could not set the load-in: ${loadInError.message}`)

  // Same day as the show, so the stay sits on the day view the schedule specs
  // open. tour_date_id and check_in_date are a composite foreign key onto
  // tour_dates (id, date): writing one without the other is a 23503, not a
  // silent bug, which is the whole point of that constraint.
  const { data: stay, error: stayError } = await testDb
    .from('hotel_stays')
    .insert({
      tour_id: a.tourId,
      tour_date_id: a.tourDateId,
      check_in_date: a.date,
      check_out_date: nextDay(a.date),
      name: 'Seeded Hotel',
      city: 'London',
    })
    .select('id')
    .single()
  if (stayError || !stay) throw new Error(`seed: could not create hotel stay: ${stayError?.message}`)

  // Its own day, because a tour_date carries one day_type and the show day is
  // already a show.
  const rehearsalDate = nextDay(a.date)
  const { data: rehearsalDay, error: rehearsalDayError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: a.tourId, date: rehearsalDate, day_type: 'rehearsal' })
    .select('id')
    .single()
  if (rehearsalDayError || !rehearsalDay) {
    throw new Error(`seed: could not create rehearsal day: ${rehearsalDayError?.message}`)
  }

  const { data: rehearsal, error: rehearsalError } = await testDb
    .from('rehearsals')
    .insert({
      tour_id: a.tourId,
      tour_date_id: rehearsalDay.id,
      location_name: 'Seeded Rehearsal Rooms',
    })
    .select('id')
    .single()
  if (rehearsalError || !rehearsal) {
    throw new Error(`seed: could not create rehearsal: ${rehearsalError?.message}`)
  }

  return {
    a: { ...a, hotelStayId: stay.id, rehearsalId: rehearsal.id, rehearsalDate },
    b,
  }
}

// Two deletes, and the cascade does the rest, same as destroyFixture.
export async function destroyE2eSeed(seed: { a: { userId: string }; b: { userId: string } }) {
  await testDb.auth.admin.deleteUser(seed.a.userId)
  await testDb.auth.admin.deleteUser(seed.b.userId)
}

// Date arithmetic on a plain date string, no timezone involved: these are
// `date` columns, not timestamptz, so there is no day to get wrong.
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
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
