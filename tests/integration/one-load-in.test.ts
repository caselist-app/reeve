import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { updateDaySheet } from '@/lib/actions/shows'
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

  // The stored instant, read back from the one column that is allowed to hold it.
  // Every assertion below compares against this rather than against a hardcoded
  // timestamp, so the test says "they agree" rather than encoding a timezone
  // calculation of its own and then checking its own arithmetic.
  async function storedDaySheet() {
    const { data, error } = await testDb
      .from('day_sheets')
      .select('load_in, curfew')
      .eq('show_id', fixture.showId)
      .single()
    if (error) throw new Error(`could not read the day sheet: ${error.message}`)
    return data
  }

  describe('there is nowhere else to put one', () => {
    // Asserted through PostgREST rather than through the typed client, because
    // the typed client cannot express this: once lib/types/database.ts is
    // regenerated, `select('load_in_at')` is a compile error, which is a useful
    // guard but not a runtime one. Types can be stale against the database, and
    // the database is what the crew-facing reads actually hit.
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

    it('still has the day sheet columns that replaced them', async () => {
      // The inverse case. Two of the three tests above would also pass if the
      // day sheet had been dropped instead, or if the table had been renamed, so
      // this pins down that the survivor survived.
      const { status } = await selectShowColumn('id')
      expect(status).toBe(200)

      const sheet = await storedDaySheet()
      expect(sheet).toHaveProperty('load_in')
      expect(sheet).toHaveProperty('curfew')
    })
  })

  describe('every surface reads the one that survives', () => {
    beforeEach(async () => {
      // Set once, through the one writer, exactly as a TM would from the day
      // view's show panel.
      const result = await updateDaySheet(fixture.showId, {
        load_in: LOAD_IN_LOCAL,
        curfew: CURFEW_LOCAL,
      })
      if (result.error) throw new Error(`could not set the day sheet: ${result.error}`)
    })

    it('gives the planner the day sheet load-in as the required site arrival', async () => {
      // The feasibility ranking compares door_to_site_at against this, so a stale
      // value here does not just display wrongly, it ranks a flight as feasible
      // that gets the crew to the venue after load-in.
      const sheet = await storedDaySheet()

      expect(await requiredSiteArrivalFor(testDb, fixture.showId)).toBe(sheet.load_in)
    })

    it('gives the timeline the same load-in the planner got', async () => {
      const sheet = await storedDaySheet()

      const records = await fetchDayRecords(testDb, {
        tourId: fixture.tourId,
        tourDateId: fixture.tourDateId,
        date: DATE,
        timezone: TIMEZONE,
      })

      const show = records.shows.find((s) => s.id === fixture.showId)
      if (!show) throw new Error('the show is not on its own day')

      expect(show.day_sheets?.load_in).toBe(sheet.load_in)
      expect(show.day_sheets?.curfew).toBe(sheet.curfew)
    })

    it('tells the crew the time the TM typed, in the tour timezone', async () => {
      // The point of the whole brief, stated as one assertion. The TM typed
      // 10:00. Anything other than 10:00 reaching a crew member's handset is the
      // failure Brief 36 exists to remove, whether the cause is a second column
      // or a render in the wrong timezone.
      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      expect(itinerary).toContain(`Load in: ${LOAD_IN_LOCAL}`)
      expect(itinerary).toContain(`Curfew: ${CURFEW_LOCAL}`)
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

      const sheet = await storedDaySheet()
      expect(show.day_sheet?.load_in).toBe(sheet.load_in)

      // Nothing on the show entry itself claims to be a load-in any more.
      expect(Object.keys(show)).not.toContain('load_in_at')
      expect(Object.keys(show)).not.toContain('curfew_at')
    })
  })
})
