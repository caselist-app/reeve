import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'
import { requiredSiteArrivalFor } from '@/lib/shows/load-in'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { renderItinerary } from '@/lib/comms/templates/itinerary'
import { assembleTourContext } from '@/lib/ai/context'

// Brief 36 step 3. shows.load_in_at and day_sheets.load_in both meant "when is
// load-in", written by two different tabs of the same page, with nothing syncing
// them. The split in the consumers is the dangerous part: the planner's
// feasibility ranking, the AI tour context, broadcast change alerts and the
// /itinerary reply sent to crew all read the show column, while the timeline the
// TM looks at read the day sheet.
//
// So a crew member could be sent a load-in time the TM could not see anywhere on
// their schedule. Matt's call, 2026-08-04: a show has times, the day sheet is
// those times, everything else feeds off it.
//
// This file is the acceptance criterion written as a test rather than as a manual
// check nobody will repeat. It has two halves and both are needed:
//
//   1. There is nowhere else to put a load-in. Proved structurally, because a
//      test that only checks agreement would still pass if a second column came
//      back and simply happened to hold the same value.
//   2. Every surface reads the one that survives, and reads it the same. Set the
//      time once, then ask each consumer separately.

const DATE = '2030-06-14'

// The tour is on Europe/London and the show is in June, so the tour is an hour
// off UTC. That is deliberate: it is the difference between "every surface reads
// the same column" and "every surface tells the TM and the crew the same time",
// and only the second one is what Brief 36 promises. A UTC tour would let a
// surface that formats in the wrong zone pass by luck.
const TIMEZONE = 'Europe/London'
const LOAD_IN_LOCAL = '10:00'
const CURFEW_LOCAL = '23:00'

describe('load-in and curfew have one home', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // The stored instant, read back from the one row that is allowed to hold it.
  // Every assertion below compares against this rather than against a hardcoded
  // timestamp, so the test says "they agree" rather than encoding a timezone
  // calculation of its own and then checking its own arithmetic.
  //
  // Brief 42 moved the home from a day_sheets column to a day_items row. The
  // question this file asks is unchanged: is there exactly one, and does every
  // surface read it.
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
    // Asserted through PostgREST rather than through the typed client, because
    // the typed client cannot express this: once lib/types/database.ts is
    // regenerated, `select('load_in_at')` is a compile error, which is a useful
    // guard but not a runtime one. Types can be stale against the database, and
    // the database is what the crew-facing reads actually hit.
    async function selectColumn(table: string, column: string) {
      const res = await fetch(
        `${process.env.SUPABASE_TEST_URL}/rest/v1/${table}?select=${column}&limit=1`,
        {
          headers: {
            apikey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? '',
            Authorization: `Bearer ${process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''}`,
          },
        },
      )
      return { status: res.status, body: await res.json() }
    }

    const selectShowColumn = (column: string) => selectColumn('shows', column)

    it('has dropped shows.load_in_at', async () => {
      const { status, body } = await selectShowColumn('load_in_at')

      // Asserted on the code, not merely on "an error happened": a 400 for some
      // other reason would otherwise let this pass while the column still exists.
      // 42703 is Postgres for undefined_column.
      expect(status).toBe(400)
      expect(body.code).toBe('42703')
    })

    it('has dropped shows.curfew_at', async () => {
      const { status, body } = await selectShowColumn('curfew_at')

      expect(status).toBe(400)
      expect(body.code).toBe('42703')
    })

    it('answers on day_items instead', async () => {
      // The inverse case. Both tests above would also pass if the whole schema
      // had been dropped or a table renamed, which is a far worse migration and
      // an identical error code, so this pins down that the survivor survived.
      //
      // Structural, like its siblings, and asserting nothing about the contents.
      // This block seeds no times: the surfaces-agree block below does that, and
      // an assertion here that needed a row would fail on an empty table for a
      // reason that has nothing to do with what it claims to check.
      expect((await selectShowColumn('id')).status).toBe(200)
      expect((await selectColumn('day_items', 'kind,starts_at')).status).toBe(200)
    })
  })

  describe('every surface reads the one that survives', () => {
    beforeEach(async () => {
      // Set once, through the one writer, exactly as a TM would from the day
      // view. Two calls rather than one payload, because a day is rows now: a
      // load-in and a curfew are two separate things a TM adds separately.
      for (const [kind, clock] of [
        ['load_in', LOAD_IN_LOCAL],
        ['curfew', CURFEW_LOCAL],
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

    it('gives the planner the load-in item as the required site arrival', async () => {
      // The feasibility ranking compares door_to_site_at against this, so a stale
      // value here does not just display wrongly, it ranks a flight as feasible
      // that gets the crew to the venue after load-in.
      expect(await requiredSiteArrivalFor(testDb, fixture.showId)).toBe(
        await storedTime('load_in'),
      )
    })

    it('gives the timeline the same load-in the planner got', async () => {
      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: DATE,
        timezone: TIMEZONE,
      })

      // A failed read must not read as a day with no times, which is exactly what
      // an assertion on an empty array would do.
      expect(records.itemsError).toBeNull()

      const loadIn = records.items.find((i) => i.kind === 'load_in')
      const curfew = records.items.find((i) => i.kind === 'curfew')
      if (!loadIn || !curfew) throw new Error('the day is missing the items under test')

      expect(loadIn.starts_at).toBe(await storedTime('load_in'))
      expect(curfew.starts_at).toBe(await storedTime('curfew'))
    })

    it('tells the crew the time the TM typed, in the tour timezone', async () => {
      // The point of the whole brief, stated as one assertion. The TM typed
      // 10:00. Anything other than 10:00 reaching a crew member's handset is the
      // failure Brief 36 exists to remove, whether the cause is a second column
      // or a render in the wrong timezone.
      //
      // The label is the kind list's, so this is 'Load-in' where the old fixed
      // nine-line list said 'Load in'. Hardcoded rather than read off the list,
      // because this is the string a crew member sees and a test that derives it
      // would agree with the code whatever the code said.
      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      expect(itinerary).toContain(`Load-in: ${LOAD_IN_LOCAL}`)
      expect(itinerary).toContain(`Curfew: ${CURFEW_LOCAL}`)
    })

    it('tells the crew which day the show is, not just what time', async () => {
      // Added after this regressed. The old template carried the date on the
      // venue access line, because that was the one entry in a fixed nine-line
      // list that used a date format, and removing the list removed the date
      // with it. For one commit /itinerary answered with a venue, a list of
      // times and no day at all, which is worse than useless to a crew member
      // deciding whether to travel tonight or in the morning.
      //
      // Asserted on the day and month rather than the rendered weekday, so this
      // does not encode a date calculation of its own and then check its own
      // arithmetic.
      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      expect(itinerary).toContain('14 Jun')
    })

    it('sends no line at all for a time the TM has not set', async () => {
      // The other half of rows. The old template printed nine fixed labels and
      // wrote TBC against every one that was empty, so a show with two times sent
      // seven lines of nothing. An item that does not exist has no line.
      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      expect(itinerary).not.toContain('Soundcheck')
      expect(itinerary).not.toContain('TBC')
    })

    it('still finds the show on its own show day, so the crew are told about tonight', async () => {
      // The active-show query used to key off shows.curfew_at as an absolute
      // instant. day_sheets.curfew is pinned to the show's own date, so
      // repointing that filter at it would have made a show stop being active at
      // its own curfew rather than at the end of the night. This asserts the show
      // is still selected while it is on.
      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      expect(itinerary).toContain('Test Venue')
      expect(itinerary).not.toContain('No upcoming shows')
    })

    it('hands the AI one load-in rather than two that can disagree', async () => {
      // lib/ai/context.ts selected shows.load_in_at AND the day sheet's load_in,
      // so the model was handed both and no rule for which one wins. The show
      // entry must now carry the time in exactly one place.
      const context = await assembleTourContext(fixture.tourId)
      const show = context.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is missing from the AI context')

      const loadIn = show.items.find((i) => i.kind === 'load_in')
      if (!loadIn) throw new Error('the AI context is missing the load-in')
      expect(loadIn.starts_at).toBe(await storedTime('load_in'))

      // Exactly one, so the model cannot be handed two answers to one question.
      expect(show.items.filter((i) => i.kind === 'load_in')).toHaveLength(1)

      // Nothing on the show entry itself claims to be a load-in any more.
      expect(Object.keys(show)).not.toContain('load_in_at')
      expect(Object.keys(show)).not.toContain('curfew_at')
      expect(Object.keys(show)).not.toContain('day_sheet')
    })
  })
})
