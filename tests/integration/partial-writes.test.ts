import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDaySheet } from '@/lib/actions/shows'

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
