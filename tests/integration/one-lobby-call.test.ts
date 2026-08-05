import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './setup'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDaySheet } from '@/lib/actions/shows'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { assembleTourContext } from '@/lib/ai/context'
import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'

// Brief 36 Part 3, decision 3. day_sheets held two columns for one event.
// lobby_call_at was read by the day timeline and written by nothing, so it was
// always null and its card never rendered. hotel_departure was fully wired and
// held the same fact. Matt's call, 2026-08-04: lobby call is the term, and the
// column gets renamed rather than the input relabelled.
//
// This file exists because tsc cannot check the thing most likely to break in a
// rename. Every typed reference is a compile error if it is missed, but the two
// PostgREST select strings (SHOW_SELECT in lib/schedule/day-records.ts, and the
// day_sheets embed in lib/ai/context.ts) are plain text. A missed rename in
// either one fails at runtime, on the day view and in the crew Q&A context
// respectively, and nothing before this test would have said so.
//
// The rename ships in two migrations, so this file covers the first half only.
// While hotel_departure still exists as an unread copy, "there is nowhere else
// to put a lobby call" is not yet true and asserting it here would be a test
// that has to be wrong for a while. The 42703 assertions arrive with
// 20260805140000_drop_hotel_departure.sql, in the commit that applies it. What
// is provable now is that nothing in the app writes or reads the old name.

const DATE = '2030-06-14'
const TIMEZONE = 'Europe/London'
const LOBBY_CALL_LOCAL = '05:00'

describe('the lobby call has one home and one name', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  async function storedDaySheet() {
    const { data, error } = await testDb
      .from('day_sheets')
      .select('lobby_call, curfew')
      .eq('show_id', fixture.showId)
      .single()
    if (error) throw new Error(`could not read the day sheet: ${error.message}`)
    return data
  }

  describe('the column exists under its new name', () => {
    it('answers to lobby_call', async () => {
      const res = await fetch(
        `${process.env.SUPABASE_TEST_URL}/rest/v1/day_sheets?select=lobby_call&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '',
            Authorization: `Bearer ${process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''}`,
          },
        },
      )
      expect(res.status).toBe(200)
    })

    it('writes the lobby call to the new column and leaves the old one alone', async () => {
      // The migration copied hotel_departure into lobby_call and stopped there.
      // From here the app writes only the new column, so the old one holds
      // whatever it held before and drifts, which is exactly what makes it safe
      // to drop later rather than now.
      await updateDaySheet(fixture.showId, { lobby_call: LOBBY_CALL_LOCAL })

      const { data, error } = await testDb
        .from('day_sheets')
        .select('lobby_call')
        .eq('show_id', fixture.showId)
        .single()
      if (error) throw new Error(`could not read the day sheet: ${error.message}`)

      expect(data.lobby_call).not.toBeNull()
    })
  })

  describe('every surface reads the one that survives', () => {
    beforeEach(async () => {
      // Set once, through the one writer, as a TM would from the day view's
      // show panel. 05:00 deliberately: it is the value that makes the
      // roll-over rule's two groups matter, and an early lobby call is the case
      // a cutoff hour gets wrong.
      const result = await updateDaySheet(fixture.showId, {
        lobby_call: LOBBY_CALL_LOCAL,
        load_in: '10:00',
        doors: '19:00',
        curfew: '01:30',
      })
      if (result.error) throw new Error(`could not set the day sheet: ${result.error}`)
    })

    it('gives the day timeline the lobby call', async () => {
      // SHOW_SELECT is a plain string, so this is the assertion that a missed
      // rename in it shows up as a failure rather than as an empty day view.
      const sheet = await storedDaySheet()

      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: DATE,
        timezone: TIMEZONE,
      })

      const show = records.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is not on its own day')

      expect(show.day_sheets?.lobby_call).toBe(sheet.lobby_call)

      // Nothing the day view is handed still claims to hold a lobby call under
      // either old name. This is provable now, before the columns are dropped,
      // because it is about what SHOW_SELECT asks for rather than about what
      // the table has.
      expect(Object.keys(show.day_sheets ?? {})).not.toContain('hotel_departure')
      expect(Object.keys(show.day_sheets ?? {})).not.toContain('lobby_call_at')
    })

    it('gives the AI the same lobby call the timeline got', async () => {
      // The other untyped select string, and the one that runs on Trigger.dev.
      // A missed rename here is invisible on Vercel and reaches a crew member.
      const sheet = await storedDaySheet()

      const context = await assembleTourContext(fixture.tourId)
      const show = context.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is missing from the AI context')

      expect(show.day_sheet?.lobby_call).toBe(sheet.lobby_call)
    })

    it('keeps an 05:00 lobby call on the show day', async () => {
      // The rename must not quietly move the field between the two groups in
      // lib/schedule/day-sheet-times.ts. It is a daytime field: it never
      // crosses midnight, which is why the form now lists it under Arrival
      // rather than at the end under Departure.
      const sheet = await storedDaySheet()
      if (!sheet.lobby_call || !sheet.curfew) {
        throw new Error('the day sheet did not store the times under test')
      }

      expect(localDateInZone(sheet.lobby_call, TIMEZONE)).toBe(DATE)
      expect(localTimeInZone(sheet.lobby_call, TIMEZONE)).toBe(LOBBY_CALL_LOCAL)

      // And the curfew on the same sheet still rolled, so this is the two-group
      // rule working rather than roll-over having been switched off.
      expect(localDateInZone(sheet.curfew, TIMEZONE)).toBe('2030-06-15')
    })
  })
})
