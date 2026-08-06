import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'
import { fetchDayRecords } from '@/lib/schedule/day-records'
import { assembleTourContext } from '@/lib/ai/context'
import { localDateInZone, localTimeInZone } from '@/lib/schedule/datetime'

// Brief 36 Part 3, decision 3, then Brief 42. A lobby call was once two columns
// for one event (a written-but-unread one and a wired one holding the same
// fact), collapsed to a single column and then, in Brief 42, moved off columns
// entirely into a day_items row. REE-23 dropped the old table for good.
//
// This file exists because tsc cannot check the thing most likely to break when
// a store moves: every typed reference is a compile error if it is missed, but a
// day view that reads one place while comms read another agrees with the
// compiler and still tells the crew a different time from the TM. So it sets the
// lobby call once, through the one writer, and asks each surface separately.
//
// That the old homes are gone rather than merely unread is covered structurally
// now, by tests/unit/no-retired-tables.test.ts, which is why this file no longer
// pokes the dropped relation directly.

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

  // The one place a lobby call is stored now: a day_items row keyed by show and
  // kind. Every surface below is checked against this, so the test says "they
  // agree" rather than encoding a second copy of the answer.
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
    })

    it('gives the AI the same lobby call the timeline got', async () => {
      // The AI context runs on Trigger.dev, so a miss here is invisible on Vercel
      // and reaches a crew member. It reads the lobby call from the same day
      // items the timeline does, and this is what keeps the two in step.
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
      // link is the 14th, so the timeline shows it under the show it ends. A day
      // item carries both facts on one row, which is why it needs no late-night
      // tail to place a small-hours curfew.
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
