import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDaySheet } from '@/lib/actions/shows'
import { updateContact } from '@/lib/actions/contacts'
import { addPerson, updatePersonTerms } from '@/lib/actions/people'
import type { ContactForm } from '@/lib/validators/contact'

// The bug this file exists for, in full:
//
// components/schedule/panels/show-panel.tsx submits 14 time fields and no
// catering. daySheetFormSchema had .default('none') on catering_type, so Zod
// invented a value for a key nobody sent, and updateDaySheet's loop turned the
// six absent catering times into null and wrote them. Every time a TM edited
// load-in from the day view, the catering they had entered on the show page was
// destroyed. It typechecked, it linted, it built, and it was silent.
//
// The fix distinguishes "not submitted" (undefined, skip it) from "cleared"
// (null, write it). Both halves need a test: skipping undefined is useless if
// null stops being written, because then a TM could never clear a field.

const TIMES_ONLY = {
  venue_access: '09:00',
  load_in: '10:00',
  line_check: null,
  soundcheck: '15:00',
  vip: null,
  doors: '19:00',
  support_on: null,
  support_off: null,
  changeover: null,
  headliner_on: '21:00',
  headliner_off: null,
  curfew: '23:00',
  load_out: null,
  hotel_departure: null,
}

describe('updateDaySheet partial writes', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture()
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function readDaySheet() {
    const { data } = await testDb
      .from('day_sheets')
      .select('*')
      .eq('show_id', fixture.showId)
      .single()
    return data
  }

  it('leaves catering alone when the form did not submit it', async () => {
    await testDb
      .from('day_sheets')
      .update({
        catering_type: 'provided',
        catering_lunch_start: `${fixture.date}T12:00:00.000Z`,
        catering_dinner_start: `${fixture.date}T17:00:00.000Z`,
      })
      .eq('show_id', fixture.showId)

    // Exactly what the schedule day view's show panel sends.
    const result = await updateDaySheet(fixture.showId, TIMES_ONLY)
    expect(result.error).toBeNull()

    const after = await readDaySheet()
    expect(after?.catering_type).toBe('provided')
    expect(after?.catering_lunch_start).not.toBeNull()
    expect(after?.catering_dinner_start).not.toBeNull()
  })

  it('still writes the times it did submit', async () => {
    await updateDaySheet(fixture.showId, TIMES_ONLY)

    const after = await readDaySheet()
    expect(after?.load_in).not.toBeNull()
    expect(after?.doors).not.toBeNull()
    expect(after?.curfew).not.toBeNull()
  })

  it('clears a field the TM blanked, because null is not undefined', async () => {
    await updateDaySheet(fixture.showId, TIMES_ONLY)
    expect((await readDaySheet())?.load_in).not.toBeNull()

    await updateDaySheet(fixture.showId, { ...TIMES_ONLY, load_in: null })
    expect((await readDaySheet())?.load_in).toBeNull()
  })

  it("honours an explicit 'none' while ignoring an absent one", async () => {
    // catering_type is `not null default 'none'`, so a fresh row already reads
    // 'none' and "left alone" is indistinguishable from "written to 'none'" on
    // one. This is the pair that separates them: a TM who actively chooses
    // 'none' must be obeyed, while a form that never mentions catering must not
    // be treated as having chosen it. Restoring the .default() in
    // daySheetFormSchema makes this test fail on the second half.
    await testDb
      .from('day_sheets')
      .update({ catering_type: 'provided' })
      .eq('show_id', fixture.showId)

    await updateDaySheet(fixture.showId, { ...TIMES_ONLY, catering_type: 'none' })
    expect((await readDaySheet())?.catering_type).toBe('none')

    await testDb
      .from('day_sheets')
      .update({ catering_type: 'provided' })
      .eq('show_id', fixture.showId)

    await updateDaySheet(fixture.showId, TIMES_ONLY)
    expect((await readDaySheet())?.catering_type).toBe('provided')
  })

  it('writes catering when the caller does submit it', async () => {
    await updateDaySheet(fixture.showId, {
      ...TIMES_ONLY,
      catering_type: 'buyout',
      catering_lunch_start: '12:30',
    })

    const after = await readDaySheet()
    expect(after?.catering_type).toBe('buyout')
    expect(after?.catering_lunch_start).not.toBeNull()
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
