import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'
import { previewBroadcast } from '@/lib/actions/broadcast'

// Brief 36 step 3 moved load-in and curfew onto the day sheet, and the crew
// change alert had to move with them. Two things are being pinned down here, and
// the second one is the reason this file exists at all:
//
//   1. The alert reads the surviving column, so the time offered to crew is the
//      time the TM typed, in the tour's timezone.
//   2. The message names the time that actually changed. buildShowTimeChangeMessage
//      used to be buildShowLoadInChangeMessage with "load-in" hardcoded, while
//      ChangeDescriptor already allowed a curfew change, so a curfew alert said
//      "load-in at X is now 23:00". It went unnoticed because the caller resolved a
//      curfew change to null and the message said TBC: a wrong label attached to no
//      time. Repointing at the day sheet made that branch resolve a real value,
//      which would have turned a quietly useless message into a confidently wrong
//      one sent to a crew member's handset.

const DATE = '2030-06-14'

// Europe/London in June, so the tour is an hour off UTC. A message rendered in
// UTC would pass a same-zone test and still tell crew the wrong time.
const TIMEZONE = 'Europe/London'

describe('the day sheet change alert', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })

    // Brief 42: the times are day_items rows and the alert reads them through
    // fetchShowItems. Seeded through the one writer, which is now the same one
    // the day view uses, so a change alert quoting a stale time is impossible by
    // construction rather than by agreement.
    for (const [kind, clock] of [
      ['load_in', '10:00'],
      ['curfew', '23:00'],
    ] as const) {
      const seeded = await createDayItem({
        tour_id: fixture.tourId,
        tour_date_id: fixture.tourDateId,
        show_id: fixture.showId,
        kind,
        start_clock: clock,
      })
      if (seeded.error) throw new Error(`could not seed the ${kind}: ${seeded.error}`)
    }
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  it('offers the load-in the TM typed, in the tour timezone', async () => {
    const preview = await previewBroadcast(fixture.tourId, {
      type: 'show',
      showId: fixture.showId,
      field: 'load_in',
    })

    expect(preview.message).toContain('load-in')
    expect(preview.message).toContain('10:00')
    // 09:00 is the stored UTC instant. If it reaches a crew member, the render is
    // in the wrong zone, which is the same failure as having two columns arriving
    // by a different route.
    expect(preview.message).not.toContain('09:00')
  })

  it('calls a curfew change a curfew, not a load-in', async () => {
    const preview = await previewBroadcast(fixture.tourId, {
      type: 'show',
      showId: fixture.showId,
      field: 'curfew',
    })

    expect(preview.message).toContain('curfew')
    expect(preview.message).not.toContain('load-in')
    expect(preview.message).toContain('23:00')
  })

  it('resolves a curfew change to a real time rather than TBC', async () => {
    // The half of the old bug that hid the other half. A curfew change used to
    // resolve its value to null, so the message read "load-in ... is now TBC" and
    // nobody could tell which part was wrong.
    const preview = await previewBroadcast(fixture.tourId, {
      type: 'show',
      showId: fixture.showId,
      field: 'curfew',
    })

    expect(preview.message).not.toContain('TBC')
  })

  it('still describes an address change as a move, not as a time', async () => {
    // The one show-level field that survived on the show row, so this is the
    // inverse case: the branch that must not have been repointed at the day sheet.
    const preview = await previewBroadcast(fixture.tourId, {
      type: 'show',
      showId: fixture.showId,
      field: 'address',
    })

    expect(preview.message).not.toContain('load-in')
    expect(preview.message).not.toContain('curfew')
  })
})
