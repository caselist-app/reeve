import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'
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
// Two halves, as in one-load-in.test.ts:
//
//   1. There is nowhere else to put a lobby call.
//   2. Every surface reads the one that survives, under its new name.
//
// The first half arrived a commit later than the second, because the rename
// shipped as an add-and-copy followed by a drop. While hotel_departure still
// existed as an unread copy, asserting it was gone would have been a test that
// had to be wrong for a while.

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

  // Brief 42 moved the home again, from a day_sheets column to a day_items row.
  // The question is unchanged and so is the reason this file exists: the two
  // untyped PostgREST select strings are gone now, but the surfaces still have to
  // agree, and a day view that reads one table while comms read another is the
  // same failure wearing different clothes.
  async function storedTime(kind: string) {
    const { data, error } = await testDb
      .from('day_items')
      .select('starts_at')
      .eq('show_id', fixture.showId)
      .eq('kind', kind)
      .single()
    if (error) throw new Error(`could not read the ${kind} item: ${error.message}`)
    return data.starts_at
  }

  describe('there is nowhere else to put one', () => {
    async function selectDaySheetColumn(column: string) {
      const res = await fetch(
        `${process.env.SUPABASE_TEST_URL}/rest/v1/day_sheets?select=${column}&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '',
            Authorization: `Bearer ${process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''}`,
          },
        },
      )
      return { status: res.status, body: await res.json() }
    }

    it('has dropped day_sheets.hotel_departure', async () => {
      const { status, body } = await selectDaySheetColumn('hotel_departure')

      // 42703 is Postgres for undefined_column. Asserted on the code rather
      // than on "an error happened", so a 400 for an unrelated reason cannot
      // let this pass while the column is still there.
      expect(status).toBe(400)
      expect(body.code).toBe('42703')
    })

    it('has dropped day_sheets.lobby_call_at', async () => {
      const { status, body } = await selectDaySheetColumn('lobby_call_at')

      expect(status).toBe(400)
      expect(body.code).toBe('42703')
    })

    it('answers to lobby_call instead', async () => {
      // The inverse case. Both tests above would also pass if day_sheets had
      // been dropped or renamed outright, which is a far worse migration and an
      // identical error code.
      const { status } = await selectDaySheetColumn('lobby_call')
      expect(status).toBe(200)
    })
  })

  describe('every surface reads the one that survives', () => {
    beforeEach(async () => {
      // Set once, through the one writer, as a TM would from the day view.
      // 05:00 deliberately: it is the value that makes the roll-over rule
      // matter, and an early lobby call is the case a cutoff hour gets wrong.
      //
      // Order matters here in a way it did not with columns, and that is worth
      // knowing rather than discovering. The roll-over anchors on the day's
      // latest daytime time, so the curfew is added last, once the load-in and
      // doors are there to anchor against. A TM typing them in this order is the
      // normal case; one who types the curfew first gets the fallback anchor,
      // which still rolls 01:30 correctly.
      for (const [kind, clock] of [
        ['lobby_call', LOBBY_CALL_LOCAL],
        ['load_in', '10:00'],
        ['doors', '19:00'],
        ['curfew', '01:30'],
      ] as const) {
        const result = await createDayItem({
          tour_id: fixture.tourId,
          tour_date_id: fixture.tourDateId,
          show_id: fixture.showId,
          kind,
          start_clock: clock,
        })
        if (result.error) throw new Error(`could not set the ${kind}: ${result.error}`)
      }
    })

    it('gives the day timeline the lobby call', async () => {
      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: DATE,
        timezone: TIMEZONE,
      })

      // Checked before anything else. An items read that failed returns an empty
      // array, and every assertion below would then be asserting on nothing.
      expect(records.itemsError).toBeNull()

      const lobbyCall = records.items.find((i) => i.kind === 'lobby_call')
      if (!lobbyCall) throw new Error('the day is missing its lobby call')

      expect(lobbyCall.starts_at).toBe(await storedTime('lobby_call'))

      // Nothing the day view is handed still claims to hold a day sheet. The
      // embed and its two old column names are gone from SHOW_SELECT together.
      const show = records.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is not on its own day')
      expect(Object.keys(show)).not.toContain('day_sheets')
    })

    it('gives the AI the same lobby call the timeline got', async () => {
      // The AI context runs on Trigger.dev, so a miss here is invisible on Vercel
      // and reaches a crew member. It had the second of the two untyped select
      // strings; both are gone, and this is what keeps them gone.
      const context = await assembleTourContext(fixture.tourId)
      const show = context.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is missing from the AI context')

      const lobbyCall = show.items.find((i) => i.kind === 'lobby_call')
      if (!lobbyCall) throw new Error('the AI context is missing the lobby call')

      expect(lobbyCall.starts_at).toBe(await storedTime('lobby_call'))
    })

    it('keeps an 05:00 lobby call on the show day', async () => {
      // lobby_call has crossesMidnight false on the kind list: it never crosses,
      // which is why the day form offers it first rather than after load-out.
      // Moving it into the crossing run would store an early lobby call on the
      // wrong morning, silently.
      const lobbyCall = await storedTime('lobby_call')
      const curfew = await storedTime('curfew')
      if (!lobbyCall || !curfew) throw new Error('the day did not store the times under test')

      expect(localDateInZone(lobbyCall, TIMEZONE)).toBe(DATE)
      expect(localTimeInZone(lobbyCall, TIMEZONE)).toBe(LOBBY_CALL_LOCAL)

      // And the curfew on the same day still rolled, so this is the rule working
      // rather than roll-over having been switched off.
      expect(localDateInZone(curfew, TIMEZONE)).toBe('2030-06-15')
    })

    it('keeps the rolled curfew on the day it was set on', async () => {
      // The structural claim, end to end. The instant is on the 15th and the day
      // link is the 14th, so the timeline shows it under the show it ends without
      // the late-night tail that day_events needed. A column could not hold both
      // facts, which is why the tail existed at all.
      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: DATE,
        timezone: TIMEZONE,
      })

      const curfew = records.items.find((i) => i.kind === 'curfew')
      if (!curfew) throw new Error('the curfew is not on the day it was set on')

      expect(curfew.tour_date_id).toBe(fixture.tourDateId)
      expect(localDateInZone(curfew.starts_at ?? '', TIMEZONE)).toBe('2030-06-15')
    })
  })
})
