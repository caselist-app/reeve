import { testDb, setTestUserId } from './test-db'

// One tour, one show day, one show. Built by direct insert rather than through
// create_show_with_dependents, because that RPC gates on owns_tour() and
// therefore on auth.uid(), which a service-role client does not have. The shape
// it produces is the same: since REE-23 the RPC seeds no side rows, so a show is
// just its shows row and its show_advance row, and a day's times are day_items a
// test adds when it needs them.
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
    // A pending guest_request attention_items row on account A's seeded show,
    // for /inbox/{itemId} (REE-152). Its own guest_list_entries row, not one
    // shared with anything else in the suite, so the smoke spec can open it
    // without another spec's writes changing what it sees.
    itemId: string
    // A second tour on the SAME account, in Pacific/Auckland, with one positioned
    // day_item. This is what tests/e2e/timezone.spec.ts opens from a Europe/London
    // browser to prove the calendar renders in the tour zone, not the browser's.
    // On the same account so the signed-in browser can open it; RLS would hide a
    // separate account's tour.
    zoned: ZonedShowDay
    // A Europe/London tour on the spring-forward day (2026-03-29), one positioned
    // day_item. The timezone spec opens it to prove the broadcast grid shifts by
    // wall clock, not a fixed elapsed offset, so a block past the 01:00 -> 02:00
    // change lands on its label rather than an hour off (REE-116).
    zonedDst: ZonedShowDay
    // An identity_documents row on account A's seeded contact, for
    // tests/e2e/access.spec.ts (REE-202): the only way to prove account B
    // cannot sign account A's document is a real row to try it against.
    identityDocumentId: string
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

  // A Pacific/Auckland tour on account A, for the timezone regression. June, so
  // Auckland holds UTC+12 with no DST in play: 09:00 local is a clean morning
  // hour whose UTC instant (21:00Z the day before) reads as a very different hour
  // in any browser zone, which is the whole point.
  const zoned = await createZonedShowDay(a.userId, {
    timezone: 'Pacific/Auckland',
    date: '2026-06-14',
    dayItemLocalTime: '09:00',
    tourName: 'Aurora Australis Tour',
    artistName: 'Southern Cross',
  })

  // A Europe/London show on the spring-forward day: clocks jump 01:00 -> 02:00,
  // so the broadcast window [04:00, +1 04:00) is a clean 24 wall hours but the
  // literal calendar day RBC draws is only 23. A 09:00 load-in is five hours past
  // the 04:00 broadcast start, so it must sit at 5/24 of the grid whatever the
  // change did earlier. The retired fixed-offset shift put it at 6/24, an hour
  // low; tests/e2e/timezone.spec.ts opens this to catch that in a real browser.
  const zonedDst = await createZonedShowDay(a.userId, {
    timezone: 'Europe/London',
    date: '2026-03-29',
    dayItemLocalTime: '09:00',
    tourName: 'Equinox Tour',
    artistName: 'Meridian',
  })

  // A day_items row since Brief 42, not a fixed day-sheet column. Inserted directly
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

  // A real object, not just a row: tests/e2e/access.spec.ts also asserts
  // account A can sign its own document, and Supabase Storage's
  // createSignedUrl errors against a path with nothing behind it, so a fake
  // path would make that positive control fail for the wrong reason.
  const identityDocumentPath = `${a.userId}/${a.contactId}/seeded.pdf`
  const { error: identityUploadError } = await testDb.storage
    .from('identity-documents')
    .upload(identityDocumentPath, new TextEncoder().encode('%PDF-1.4 seeded'), {
      contentType: 'application/pdf',
    })
  if (identityUploadError) {
    throw new Error(`seed: could not upload identity document: ${identityUploadError.message}`)
  }

  const { data: identityDocument, error: identityDocumentError } = await testDb
    .from('identity_documents')
    .insert({
      account_id: a.userId,
      contact_id: a.contactId,
      kind: 'passport',
      storage_path: identityDocumentPath,
      file_name: 'seeded.pdf',
      mime_type: 'application/pdf',
      byte_size: 16,
      is_primary: true,
    })
    .select('id')
    .single()
  if (identityDocumentError || !identityDocument) {
    throw new Error(`seed: could not create identity document: ${identityDocumentError?.message}`)
  }

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

  // A guest request plus the attention_items row REE-134's producer would have
  // written for it, so the smoke spec has a real /inbox/{itemId} to open
  // (REE-152). On its OWN show, not account A's main seeded show: guest-list.
  // spec.ts asserts that show's guest list "starts empty: no other spec adds a
  // guest to this show". The attention_items row is inserted already resolved,
  // so it never counts as an open item: revalidate.spec.ts's Inbox badge spec
  // asserts an exact open count of 1, "no count in the app touches
  // attention_items except this spec". fetchInboxItem reads by id regardless
  // of resolved_at, so the smoke spec can still open this route.
  const inboxItemDate = nextDay(rehearsalDate)
  const { data: inboxTourDate, error: inboxTourDateError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: a.tourId, date: inboxItemDate, day_type: 'show' })
    .select('id')
    .single()
  if (inboxTourDateError || !inboxTourDate) {
    throw new Error(`seed: could not create inbox item tour_date: ${inboxTourDateError?.message}`)
  }

  const { data: inboxShow, error: inboxShowError } = await testDb
    .from('shows')
    .insert({
      tour_id: a.tourId,
      tour_date_id: inboxTourDate.id,
      date: inboxItemDate,
      venue_name: 'Seeded Inbox Venue',
    })
    .select('id')
    .single()
  if (inboxShowError || !inboxShow) {
    throw new Error(`seed: could not create inbox item show: ${inboxShowError?.message}`)
  }

  const { data: guestEntry, error: guestEntryError } = await testDb
    .from('guest_list_entries')
    .insert({
      tour_id: a.tourId,
      show_id: inboxShow.id,
      first_name: 'Sam',
      last_name: 'Reed',
      email: 'sam.reed@example.test',
      num_tickets: 2,
      request_channel: 'app',
      requested_by_person_id: a.personId,
      status: 'requested',
    })
    .select('id')
    .single()
  if (guestEntryError || !guestEntry) {
    throw new Error(`seed: could not create guest entry: ${guestEntryError?.message}`)
  }

  const { data: item, error: itemError } = await testDb
    .from('attention_items')
    .insert({
      tour_id: a.tourId,
      kind: 'guest_request',
      title: 'Guest request: Sam Reed for Seeded Inbox Venue',
      related_table: 'guest_list_entries',
      related_id: guestEntry.id,
      resolved_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (itemError || !item) throw new Error(`seed: could not create attention item: ${itemError?.message}`)

  return {
    a: {
      ...a,
      hotelStayId: stay.id,
      rehearsalId: rehearsal.id,
      rehearsalDate,
      zoned,
      zonedDst,
      itemId: item.id,
      identityDocumentId: identityDocument.id,
    },
    b,
  }
}

// A show day plus one positioned day_item, on a given account and in a given
// timezone. Returned ids let the timezone spec open it and know exactly which
// wall-clock time to expect.
export interface ZonedShowDay {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  // The day_item's wall-clock time in `timezone`, and the UTC instant it maps to.
  dayItemLocalTime: string
  dayItemStartUtc: string
}

export async function createZonedShowDay(
  userId: string,
  opts: {
    timezone: string
    date: string
    dayItemLocalTime: string
    tourName: string
    artistName: string
  },
): Promise<ZonedShowDay> {
  const { data: artist, error: artistError } = await testDb
    .from('artists')
    .insert({ account_id: userId, name: opts.artistName })
    .select('id')
    .single()
  if (artistError || !artist) throw new Error(`seed: could not create zoned artist: ${artistError?.message}`)

  const { data: tour, error: tourError } = await testDb
    .from('tours')
    .insert({ account_id: userId, artist_id: artist.id, name: opts.tourName, timezone: opts.timezone })
    .select('id')
    .single()
  if (tourError || !tour) throw new Error(`seed: could not create zoned tour: ${tourError?.message}`)

  const { data: tourDate, error: tourDateError } = await testDb
    .from('tour_dates')
    .insert({ tour_id: tour.id, date: opts.date, day_type: 'show' })
    .select('id')
    .single()
  if (tourDateError || !tourDate) throw new Error(`seed: could not create zoned tour_date: ${tourDateError?.message}`)

  const { data: show, error: showError } = await testDb
    .from('shows')
    .insert({ tour_id: tour.id, tour_date_id: tourDate.id, date: opts.date, venue_name: 'Zoned Venue' })
    .select('id')
    .single()
  if (showError || !show) throw new Error(`seed: could not create zoned show: ${showError?.message}`)

  const dayItemStartUtc = zonedWallClockToUtc(`${opts.date}T${opts.dayItemLocalTime}`, opts.timezone)
  const { error: itemError } = await testDb.from('day_items').insert({
    tour_id: tour.id,
    tour_date_id: tourDate.id,
    show_id: show.id,
    kind: 'load_in',
    starts_at: dayItemStartUtc,
  })
  if (itemError) throw new Error(`seed: could not create zoned day_item: ${itemError.message}`)

  return {
    tourId: tour.id,
    tourDateId: tourDate.id,
    date: opts.date,
    timezone: opts.timezone,
    dayItemLocalTime: opts.dayItemLocalTime,
    dayItemStartUtc,
  }
}

// `YYYY-MM-DDTHH:MM` read as wall-clock time in `tz`, returned as a UTC ISO
// string. A local copy of lib/schedule/datetime.ts's wallClockToUtc, kept here
// so this fixture needs no path-aliased import: it is run by both vitest and
// Playwright's plain-node globalSetup, and only the relative-import form is safe
// across both.
function zonedWallClockToUtc(local: string, tz: string): string {
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

// Two deletes, and the cascade does the rest, same as destroyFixture.
export async function destroyE2eSeed(seed: {
  a: { userId: string; contactId: string }
  b: { userId: string }
}) {
  // Deleting the auth user cascades the identity_documents row away, but not
  // the object it points at: same gap destroyFixture has, and the same fix,
  // done before the user delete so the path is still derivable from live ids.
  await testDb.storage
    .from('identity-documents')
    .remove([`${seed.a.userId}/${seed.a.contactId}/seeded.pdf`])

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
