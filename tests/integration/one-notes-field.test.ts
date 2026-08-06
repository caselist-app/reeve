import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDayNotes } from '@/lib/actions/tour-dates'
import { fetchDayRecords } from '@/lib/schedule/day-records'

// Brief 36 Part 4. A day's notes lived in three places: shows.notes, a freeform
// row with the sentinel title __day_notes__ on the old day-events table, and
// tour_dates.notes. The day info panel wrote the first on a show day and the
// sentinel on every other day. Add/Edit Day wrote the third, and the Dates
// sidebar and the press-day header read it.
//
// So a TM typed a note into the day info panel and it never appeared in the
// sidebar, and typed one into Add Day and it never appeared in the panel. Two
// inputs, both labelled Notes, on one screen, writing to different tables.
//
// Matt's call, 2026-08-04: notes belong to the day.
//
// Two halves, and both are needed. Asserting only that a note round-trips would
// still pass if a second column came back and happened to hold the same string,
// which is exactly the state this brief found the app in.
//
//   1. There is nowhere else to put a note.
//   2. One writer puts it in the same place whether or not the day has a show,
//      which is the branch that produced the bug.

const SHOW_DATE = '2030-06-14'
const DAY_OFF_DATE = '2030-06-15'
const OFF_CALENDAR_DATE = '2030-06-16'
const TIMEZONE = 'Europe/London'

describe('a day has one notes field', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: SHOW_DATE, timezone: TIMEZONE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // Reads the surviving column straight from the database. Every surface that
  // shows a note (the day info panel, the mobile dock, the Dates sidebar
  // subtitle, the press-day header subtitle) now resolves it from this one row
  // through getScheduleShell, so this is what all four of them are looking at.
  async function storedDayNotes(date: string) {
    const { data, error } = await testDb
      .from('tour_dates')
      .select('id, day_type, notes')
      .eq('tour_id', fixture.tourId)
      .eq('date', date)
      .maybeSingle()
    if (error) throw new Error(`could not read the tour date: ${error.message}`)
    return data
  }

  describe('there is nowhere else to put one', () => {
    // Asked of PostgREST rather than of the typed client, because the typed
    // client cannot express this: once lib/types/database.ts is regenerated,
    // select('notes') on shows is a compile error, which is a useful guard but
    // not a runtime one. Types go stale against a database, and the database is
    // what actually answers.
    async function selectShowColumn(column: string) {
      const res = await fetch(
        `${process.env.SUPABASE_TEST_URL}/rest/v1/shows?select=${column}&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '',
            Authorization: `Bearer ${process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''}`,
          },
        },
      )
      return { status: res.status, body: await res.json() }
    }

    it('has dropped shows.notes', async () => {
      const { status, body } = await selectShowColumn('notes')

      // On the code, not merely on "an error happened": a 400 for some other
      // reason would let this pass while the column still existed. 42703 is
      // Postgres for undefined_column.
      expect(status).toBe(400)
      expect(body.code).toBe('42703')
    })

    it('still has the shows table it was dropped from', async () => {
      // The inverse case. The test above would also pass if shows had been
      // renamed or dropped outright, which would be a much worse migration and
      // an identical error code.
      const { status } = await selectShowColumn('id')
      expect(status).toBe(200)
    })

    it('hands the day view a show that does not claim to hold a note', async () => {
      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: SHOW_DATE,
        timezone: TIMEZONE,
      })

      const show = records.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is not on its own day')

      expect(Object.keys(show)).not.toContain('notes')
    })
  })

  describe('one writer, show day or not', () => {
    it('puts a note typed on a show day where the Dates sidebar reads it', async () => {
      // The headline bug. This note used to go to shows.notes, which the
      // sidebar cannot see, so the TM typed it and it vanished from the one
      // place they scan the tour from.
      const result = await updateDayNotes(fixture.tourId, SHOW_DATE, 'Ramp is round the back.')
      if (result.error) throw new Error(`could not save the note: ${result.error}`)

      const day = await storedDayNotes(SHOW_DATE)
      expect(day?.notes).toBe('Ramp is round the back.')
      expect(day?.id).toBe(fixture.tourDateId)
    })

    it('puts a note typed on a day with no show in the same column', async () => {
      // This one used to go to a __day_notes__ sentinel row on the old
      // day-events table, a third place, so the two halves of the same textarea
      // wrote to two tables depending on whether the day happened to have a show
      // on it.
      const { error } = await testDb
        .from('tour_dates')
        .insert({ tour_id: fixture.tourId, date: DAY_OFF_DATE, day_type: 'day_off' })
      if (error) throw new Error(`could not create the day off: ${error.message}`)

      const result = await updateDayNotes(fixture.tourId, DAY_OFF_DATE, 'Laundry day.')
      if (result.error) throw new Error(`could not save the note: ${result.error}`)

      const day = await storedDayNotes(DAY_OFF_DATE)
      expect(day?.notes).toBe('Laundry day.')
    })

    // A test that the writer produces no __day_notes__ sentinel row used to sit
    // here. It read the old day-events table, which REE-23 dropped, so the
    // guarantee is now structural: there is no table for a sentinel row to land
    // in, and tests/unit/no-retired-tables.test.ts is what keeps it gone.

    it('stores null when the TM clears the note, not an empty string', async () => {
      // null is the day having no note, which is what the sidebar subtitle and
      // the press-day header check before rendering. An empty string is truthy
      // enough in SQL to make "has a note" wrong, and whitespace is the same
      // problem wearing a hat.
      await updateDayNotes(fixture.tourId, SHOW_DATE, 'Ramp is round the back.')
      const result = await updateDayNotes(fixture.tourId, SHOW_DATE, '   ')
      if (result.error) throw new Error(`could not clear the note: ${result.error}`)

      const day = await storedDayNotes(SHOW_DATE)
      expect(day?.notes).toBeNull()
    })

    it('adds the day when a note is typed on a date the tour does not have yet', async () => {
      // The day info panel renders for any date in the URL. Before this, an
      // off-calendar date got a sentinel row with no tour_date to hang off,
      // which is how orphan notes accumulated. Now the note adds the day, the
      // same as every other record that resolves a date.
      expect(await storedDayNotes(OFF_CALENDAR_DATE)).toBeNull()

      const result = await updateDayNotes(fixture.tourId, OFF_CALENDAR_DATE, 'Hold for a routing change.')
      if (result.error) throw new Error(`could not save the note: ${result.error}`)

      const day = await storedDayNotes(OFF_CALENDAR_DATE)
      expect(day?.notes).toBe('Hold for a routing change.')

      // day_off, not a guess. Nothing about a note says what kind of day it is,
      // and picking one would put a chip in the sidebar the TM never chose.
      expect(day?.day_type).toBe('day_off')
    })
  })
})
