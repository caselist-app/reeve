import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateContact } from '@/lib/actions/contacts'
import { addPerson, updatePersonTerms } from '@/lib/actions/people'
import { createDayItem, updateDayItem, deleteDayItem } from '@/lib/actions/day-items'
import type { ContactForm } from '@/lib/validators/contact'

// The bug this file exists for, in full:
//
// The schedule day view's show panel submitted 14 time fields and no catering.
// daySheetFormSchema had .default('none') on catering_type, so Zod invented a
// value for a key nobody sent, and updateDaySheet's loop turned the six absent
// catering times into null and wrote them. Every time a TM edited load-in from
// the day view, the catering they had entered on the show page was destroyed.
// It typechecked, it linted, it built, and it was silent.
//
// The fix distinguishes "not submitted" (undefined, skip it) from "cleared"
// (null, write it). Both halves need a test: skipping undefined is useless if
// null stops being written, because then a TM could never clear a field.
//
// The updateDaySheet block that used to sit here is gone with the action, in the
// commit that retired the old day-sheet table as a write target. What replaced
// it is below, and it is not the same test with new column names. A day sheet
// was one wide row, so a partial save was a subset of twenty columns. An item is
// a narrow row, so the equivalent mistake is a panel that edits a location
// nulling the time, or a form that edits a time nulling the notes. The surface
// is smaller and the consequence is the same: a TM edits one thing and loses
// another, silently, and finds out on a day sheet that has already gone out over
// WhatsApp.
//
// Both directions for every field, because a fix that only skips undefined makes
// a field impossible to clear, which is the exact inverse bug.

describe('day item partial writes', () => {
  let fixture: Fixture
  let itemId: string

  // Inserted directly rather than through createDayItem, so a bug in create
  // cannot hide a bug in update. The instants are the tour's own wall clock:
  // Europe/London in June is BST, so 17:00Z reads as 18:00 and 18:30Z as 19:30.
  beforeEach(async () => {
    fixture = await createFixture()

    const { data, error } = await testDb
      .from('day_items')
      .insert({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        show_id: fixture.showId,
        kind: 'catering_dinner',
        title: 'Crew dinner',
        starts_at: `${fixture.date}T17:00:00.000Z`,
        ends_at: `${fixture.date}T18:30:00.000Z`,
        location: 'Green room',
        notes: 'Two vegan, one coeliac.',
      })
      .select('id')
      .single()

    // Thrown rather than asserted. An assertion on a missing id passes for the
    // wrong reason, because every query below would filter by undefined, return
    // nothing, and read as "the field was left alone".
    if (error || !data) throw new Error(`could not seed a day item: ${error?.message}`)
    itemId = data.id
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readItem() {
    const { data } = await testDb.from('day_items').select('*').eq('id', itemId).single()
    return data
  }

  // PostgREST renders a timestamptz as "+00:00" rather than "Z", and that is a
  // serialisation detail rather than the thing under test. Compared as instants
  // so a change in how Supabase formats a column cannot fail a test about when
  // a load-in is.
  function instant(iso: string | null | undefined): string | null {
    return iso ? new Date(iso).toISOString() : null
  }

  it('leaves everything else byte-identical when only the time moves', async () => {
    const before = await readItem()

    const result = await updateDayItem(itemId, { start_clock: '18:30' })
    expect(result.error).toBeNull()

    const after = await readItem()
    expect(after?.title).toBe(before?.title)
    expect(after?.location).toBe(before?.location)
    expect(after?.notes).toBe(before?.notes)
    expect(after?.kind).toBe(before?.kind)
    expect(after?.show_id).toBe(before?.show_id)

    // And the time it was asked to move did move, or every assertion above
    // passes on an action that did nothing at all.
    expect(instant(after?.starts_at)).toBe(`${fixture.date}T17:30:00.000Z`)
  })

  it('leaves the time alone when only the location moves', async () => {
    const before = await readItem()

    const result = await updateDayItem(itemId, { location: 'Dressing room 2' })
    expect(result.error).toBeNull()

    const after = await readItem()
    expect(after?.starts_at).toBe(before?.starts_at)
    expect(after?.ends_at).toBe(before?.ends_at)
    expect(after?.location).toBe('Dressing room 2')
  })

  it('keeps the end where it was when the start is submitted and the end is not', async () => {
    // The narrow version of the day-sheet bug: a form that posts a start and no
    // end must not be read as "the TM cleared the end". The start moves half an
    // hour and the window still shuts at 19:30.
    await updateDayItem(itemId, { start_clock: '18:30' })

    expect(instant((await readItem())?.ends_at)).toBe(`${fixture.date}T18:30:00.000Z`)
  })

  it('clears the end when the TM blanks it, because null is not undefined', async () => {
    expect((await readItem())?.ends_at).not.toBeNull()

    const result = await updateDayItem(itemId, { end_clock: null })
    expect(result.error).toBeNull()

    const after = await readItem()
    expect(after?.ends_at).toBeNull()
    // The start is untouched: clearing when a window shuts is not clearing when
    // it opens.
    expect(instant(after?.starts_at)).toBe(`${fixture.date}T17:00:00.000Z`)
  })

  it('clears the notes when the TM blanks them, and not otherwise', async () => {
    await updateDayItem(itemId, { notes: null })
    expect((await readItem())?.notes).toBeNull()

    await updateDayItem(itemId, { location: 'Catering tent' })
    expect((await readItem())?.notes).toBeNull()

    await updateDayItem(itemId, { notes: 'Back on at 19:00.' })
    expect((await readItem())?.notes).toBe('Back on at 19:00.')
  })

  it('refuses to clear a start while an end still stands', async () => {
    // An end with no start is not a window, it is a missing value, and
    // day_items_end_needs_start rejects it at the database. This is the same
    // refusal in words a TM can act on, before the insert.
    const result = await updateDayItem(itemId, { start_clock: null })

    expect(result.error).toBe('An end time needs a start time.')
    // And nothing was written, which is the half that matters. An action that
    // reports an error after a partial write is worse than one that throws.
    expect(instant((await readItem())?.starts_at)).toBe(`${fixture.date}T17:00:00.000Z`)
  })
})

// The structural claim the whole brief rests on, proved end to end rather than
// in a pure function: tour_date_id says which day an item belongs to, starts_at
// says when it happens, and for anything after midnight those are different
// days. A column could not express that, which is why a 01:30 curfew used to
// need the timeline to reach it through the show.

describe('day item times land on the right calendar day', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('stores a small-hours curfew on the next day while keeping it on this one', async () => {
    // The day has to hold a daytime time for the roll-over to anchor against,
    // which is the same reason the action reads the whole day before writing.
    const loadIn = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'load_in',
      start_clock: '14:00',
    })
    expect(loadIn.error).toBeNull()

    const curfew = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      show_id: fixture.showId,
      kind: 'curfew',
      start_clock: '01:30',
    })
    expect(curfew.error).toBeNull()
    if (!curfew.itemId) throw new Error('createDayItem did not return an item id')

    const { data } = await testDb
      .from('day_items')
      .select('tour_date_id, starts_at')
      .eq('id', curfew.itemId)
      .single()

    // The day link still points at the 14th, so the timeline shows it under the
    // show it ends.
    expect(data?.tour_date_id).toBe(fixture.tourDateId)
    // The instant is the 15th at 01:30 BST, which is 00:30Z.
    expect(new Date(data?.starts_at ?? '').toISOString()).toBe('2026-06-15T00:30:00.000Z')
  })

  it('reads the tour timezone rather than treating the clock as UTC', async () => {
    // Europe/London in June is BST. A load-in typed as 14:00 that stores as
    // 14:00Z is an hour out for every crew member reading it, and it is the
    // failure that passes every test written against a UTC fixture.
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      kind: 'load_in',
      start_clock: '14:00',
    })
    if (!created.itemId) throw new Error('createDayItem did not return an item id')

    const { data } = await testDb
      .from('day_items')
      .select('starts_at')
      .eq('id', created.itemId)
      .single()

    expect(new Date(data?.starts_at ?? '').toISOString()).toBe(`${fixture.date}T13:00:00.000Z`)
  })

  it('lets one show hold two soundchecks, which a column could not', async () => {
    for (const clock of ['15:00', '17:00']) {
      const result = await createDayItem({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        show_id: fixture.showId,
        kind: 'soundcheck',
        title: clock === '15:00' ? 'Tesseract' : 'Headliner',
        start_clock: clock,
      })
      expect(result.error).toBeNull()
    }

    const { data } = await testDb
      .from('day_items')
      .select('id, title')
      .eq('tour_date_id', fixture.tourDateId)
      .eq('kind', 'soundcheck')

    expect(data ?? []).toHaveLength(2)
  })

  it('refuses a custom item with no name', async () => {
    // day_items_other_needs_title, said as a sentence. An untitled custom item is
    // a block on the day with nothing to call it.
    const result = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      kind: 'other',
      start_clock: '13:00',
    })

    expect(result.error).toBe('A custom item needs a name.')

    const { data } = await testDb
      .from('day_items')
      .select('id')
      .eq('tour_date_id', fixture.tourDateId)
    expect(data ?? []).toHaveLength(0)
  })

  it('deletes an item without touching the day it was on', async () => {
    const created = await createDayItem({
      tour_id: fixture.tourId,
      tour_date_id: fixture.tourDateId,
      kind: 'load_in',
      start_clock: '10:00',
    })
    if (!created.itemId) throw new Error('createDayItem did not return an item id')

    const result = await deleteDayItem(created.itemId)
    expect(result.error).toBeNull()

    const { data: gone } = await testDb
      .from('day_items')
      .select('id')
      .eq('id', created.itemId)
      .maybeSingle()
    expect(gone).toBeNull()

    // Deleting the last item on a day must not revert the day's type or lose its
    // notes. It is an acceptance criterion in the brief and it is the kind of
    // thing a cascade gets wrong.
    const { data: day } = await testDb
      .from('tour_dates')
      .select('id, day_type')
      .eq('id', fixture.tourDateId)
      .single()
    expect(day?.day_type).toBe('show')
  })
})

// The same class on the other partial form in the product. components/roster/
// contact-sheet.tsx renders three different field sets from one component:
// tour-context add, tour-context edit, and roster. The pay inputs exist only in
// the first two, the default role and default rates only in the third. Every
// field one mode omits is a field the other mode's save can destroy.
//
// Both directions are asserted for each field, because a fix that only skips
// undefined makes a field impossible to clear, which is the second bug Brief 37
// names and the exact inverse of the first.

describe('contact and person partial writes', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readContact() {
    const { data } = await testDb
      .from('contacts')
      .select('*')
      .eq('id', fixture.contactId)
      .single()
    return data
  }

  async function readCrewDetail(personId: string) {
    const { data } = await testDb
      .from('crew_detail')
      .select('*')
      .eq('person_id', personId)
      .single()
    return data
  }

  // What contact-sheet.tsx posts in tour-context edit mode: identity only. The
  // default role, default type and the four default_* pay fields have no input
  // rendered on the panel at all, so none of them is in the payload.
  const IDENTITY_ONLY: ContactForm = {
    name: 'Test Crew',
    contact_email: 'crew@example.test',
    contact_phone: null,
    operational_channel: null,
    email_enabled: false,
    sms_number: null,
    emergency_contact_name: null,
    emergency_contact_phone: null,
    dietary: 'Vegan',
    allergies: null,
    home_city: null,
    passport_first_names: null,
    passport_surname: null,
    passport_number: null,
    passport_expiry: null,
    passport_country: null,
    date_of_birth: null,
    tshirt_size: null,
    notes: null,
  }

  it('leaves the default role alone when the form never rendered it', async () => {
    await testDb
      .from('contacts')
      .update({ default_role: 'FOH Engineer' })
      .eq('id', fixture.contactId)

    const result = await updateContact(fixture.contactId, IDENTITY_ONLY)
    expect(result.error).toBeNull()

    expect((await readContact())?.default_role).toBe('FOH Engineer')
  })

  it('clears the default role when the roster form posts it blank', async () => {
    await testDb
      .from('contacts')
      .update({ default_role: 'FOH Engineer' })
      .eq('id', fixture.contactId)

    await updateContact(fixture.contactId, { ...IDENTITY_ONLY, default_role: null })

    expect((await readContact())?.default_role).toBeNull()
  })

  it('leaves the default person type alone when the form never rendered it', async () => {
    // Same shape as default_role and found alongside it. The "Default type"
    // select is roster-only, but the tour-context edit path was posting the
    // tour's person_type into it, so moving someone onto a tour as support
    // rewrote their roster default.
    await testDb
      .from('contacts')
      .update({ default_person_type: 'artist' })
      .eq('id', fixture.contactId)

    await updateContact(fixture.contactId, IDENTITY_ONLY)

    expect((await readContact())?.default_person_type).toBe('artist')
  })

  it('leaves the default pay rates alone when the form never rendered them', async () => {
    await testDb
      .from('contacts')
      .update({ default_per_diem_rate: 45, default_daily_wage_rate: 250 })
      .eq('id', fixture.contactId)

    await updateContact(fixture.contactId, IDENTITY_ONLY)

    const after = await readContact()
    expect(after?.default_per_diem_rate).toBe(45)
    expect(after?.default_daily_wage_rate).toBe(250)
  })

  it('clears a default pay rate when the roster form posts it blank', async () => {
    await testDb
      .from('contacts')
      .update({ default_per_diem_rate: 45 })
      .eq('id', fixture.contactId)

    await updateContact(fixture.contactId, { ...IDENTITY_ONLY, default_per_diem_rate: null })

    expect((await readContact())?.default_per_diem_rate).toBeNull()
  })

  it('writes the identity fields it did submit', async () => {
    // The inverse of every test above: proving a field survives is worthless if
    // the action has stopped writing anything.
    await updateContact(fixture.contactId, { ...IDENTITY_ONLY, dietary: 'Coeliac' })

    expect((await readContact())?.dietary).toBe('Coeliac')
  })

  it('clears a per diem the TM blanked on the tour terms form', async () => {
    await testDb
      .from('crew_detail')
      .insert({ person_id: fixture.personId, tour_id: fixture.tourId, per_diem_rate: 40 })

    const result = await updatePersonTerms(fixture.personId, 'crew', 'FOH', {
      per_diem_rate: null,
      per_diem_currency: 'GBP',
      daily_wage_rate: null,
      wage_currency: 'GBP',
    })
    expect(result.error).toBeNull()

    expect((await readCrewDetail(fixture.personId))?.per_diem_rate).toBeNull()
  })

  it('leaves a per diem alone when the rate field was not submitted', async () => {
    await testDb
      .from('crew_detail')
      .insert({ person_id: fixture.personId, tour_id: fixture.tourId, per_diem_rate: 40 })

    await updatePersonTerms(fixture.personId, 'crew', 'FOH', {
      per_diem_currency: 'GBP',
      wage_currency: 'GBP',
    })

    expect((await readCrewDetail(fixture.personId))?.per_diem_rate).toBe(40)
  })

  it('writes a per diem the TM entered', async () => {
    await updatePersonTerms(fixture.personId, 'crew', 'FOH', {
      per_diem_rate: 55,
      per_diem_currency: 'EUR',
      daily_wage_rate: null,
      wage_currency: 'GBP',
    })

    const after = await readCrewDetail(fixture.personId)
    expect(after?.per_diem_rate).toBe(55)
    expect(after?.per_diem_currency).toBe('EUR')
  })

  it('saves notes when adding a person, the same as it does on edit', async () => {
    // personSchema had no notes key, so Zod stripped the field contact-sheet was
    // posting and addPerson never saw it. The same textarea saved correctly when
    // the TM edited the person afterwards, which is what made it look like the
    // save had worked.
    const result = await addPerson(fixture.tourId, {
      person_type: 'crew',
      name: 'Rigger',
      notes: 'Allergic to early lobby calls.',
    })
    expect(result.error).toBeNull()

    const { data: person } = await testDb
      .from('people')
      .select('contact_id')
      .eq('id', result.personId ?? '')
      .single()

    // Throwing rather than asserting: an assertion on a missing id passes for
    // the wrong reason, because a query filtered by undefined returns nothing
    // and "no notes" would read as a pass.
    if (!person) throw new Error('addPerson did not return a usable person id')

    const { data: contact } = await testDb
      .from('contacts')
      .select('notes')
      .eq('id', person.contact_id)
      .single()

    expect(contact?.notes).toBe('Allergic to early lobby calls.')
  })
})
