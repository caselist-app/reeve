import { describe, it, expect } from 'vitest'
import { describeDateMove, dateMoveHref, formatMoveDate } from '@/lib/schedule/date-move'

// Brief 36 Part 1 follow-up. Part 1 made a record correctly move to the day it
// belongs to, which means it correctly disappears from the day the TM is looking
// at. The toast is the only thing that says where it went, so the sentence it
// carries is the whole feature and it is worth testing as a pure function rather
// than by opening a panel.
//
// Three things move silently and all three are correct: the record moves, a
// tour_dates row is created if the day was not on the tour, and for a show up to
// twenty day-sheet timestamps move with it. A TM who did not want the last of
// those needs to know now, not at load-in.

const TOUR_ID = '11111111-1111-1111-1111-111111111111'

function move(over: Partial<Parameters<typeof describeDateMove>[0]> = {}) {
  return {
    tourId: TOUR_ID,
    date: '2030-06-15',
    dayCreated: false,
    carriedTimes: false,
    ...over,
  }
}

describe('formatMoveDate', () => {
  it('reads a calendar date as that date, not as an instant in the reader timezone', () => {
    // The bug this exists to prevent: `new Date('2030-06-15')` is midnight UTC,
    // so formatting it in any timezone west of UTC prints the 14th. A TM in Los
    // Angeles would be told their show moved to the day before the day it moved
    // to. check_in_date and shows.date are calendar dates with no timezone of
    // their own, so they are formatted as UTC deliberately.
    expect(formatMoveDate('2030-06-15')).toBe('Sat 15 Jun')
  })

  it('formats a date at the far end of the year without rolling over', () => {
    expect(formatMoveDate('2030-12-31')).toBe('Tue 31 Dec')
    expect(formatMoveDate('2030-01-01')).toBe('Tue 1 Jan')
  })
})

describe('describeDateMove', () => {
  it('names the day it moved to', () => {
    expect(describeDateMove(move())).toBe('Moved to Sat 15 Jun')
  })

  it('says the day was added when the date was not on the tour', () => {
    // Only the server knows this. The client knows the old date and the new one
    // and cannot tell whether the new day already existed, which is the reason
    // the action returns the sentence's inputs rather than the client deriving
    // them.
    expect(describeDateMove(move({ dayCreated: true }))).toBe(
      'Moved to Sat 15 Jun, added to the tour',
    )
  })

  it('says the times came too, because twenty timestamps moving silently is a lot', () => {
    expect(describeDateMove(move({ carriedTimes: true }))).toBe(
      'Moved to Sat 15 Jun, times moved with it',
    )
  })

  it('reads as one sentence when the day was created and the times moved', () => {
    expect(describeDateMove(move({ dayCreated: true, carriedTimes: true }))).toBe(
      'Moved to Sat 15 Jun, added to the tour, times moved with it',
    )
  })
})

describe('dateMoveHref', () => {
  it('links to the query form the date sidebar and date strip already use', () => {
    // The [date]/page.tsx route redirects to this shape, so the path form would
    // cost the TM a redirect on every toast for no benefit.
    expect(dateMoveHref(move())).toBe(`/tours/${TOUR_ID}/schedule?date=2030-06-15`)
  })
})
