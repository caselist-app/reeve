// When a boarding pass send fires, in the tour's timezone.
//
// The base rule is 6 hours before departure (REE-26, raised from 3). A 6 hour
// lead lands in the small hours for any morning flight, though: an 08:00
// departure would ping a crew member's phone at 02:00. So there is a cap. If the
// 6-hours-before instant falls in the quiet window, the send moves to the
// evening before departure instead, which is when a TM would hand a boarding
// pass over in person.
//
// Pure and timezone-aware so it can be unit tested against real zones without
// Docker. `scheduleBoardingPassSend` in lib/actions/transport.ts is the only
// caller; it owns auth, the database and the trigger, and hands the decision here.

import { localDateInZone, localTimeInZone, wallClockToUtc } from '@/lib/schedule/datetime'

// Hours before departure the pass would send with no cap applied.
export const SEND_HOURS_BEFORE_DEPARTURE = 6

// A send whose local hour is before this reads as the middle of the night and is
// pulled back to the evening before. 07:00 is the first hour a crew member is
// reasonably awake; a 07:00 or later send is left alone.
const QUIET_UNTIL_HOUR = 7

// Where a capped send lands: 20:00 local on the day before departure. Late enough
// to be "evening", early enough not to be quiet hours itself.
const EVENING_SEND_HOUR = 20

/**
 * The UTC instant a boarding pass should send at for a departure at `departAt`
 * (UTC ISO), given the tour's `timezone`.
 *
 * Returns `departAt - 6h` unless that lands in the small hours, in which case it
 * returns 20:00 local on the calendar day before departure. The result can be in
 * the past (a departure under 6 hours away, or an evening-before that has already
 * passed); the caller decides to send immediately versus scheduling a delay.
 */
export function boardingPassSendAt(departAt: string, timezone: string): Date {
  const sixHoursBefore = new Date(new Date(departAt).getTime() - SEND_HOURS_BEFORE_DEPARTURE * 60 * 60 * 1000)

  const localHour = Number(localTimeInZone(sixHoursBefore.toISOString(), timezone).slice(0, 2))
  if (localHour >= QUIET_UNTIL_HOUR) return sixHoursBefore

  // Middle of the night: send the evening before departure. Anchor on the
  // departure's local day so a departure just after midnight still resolves to
  // the prior evening rather than the same one.
  const departLocalDate = localDateInZone(departAt, timezone)
  const dayBefore = new Date(new Date(`${departLocalDate}T00:00:00Z`).getTime() - 86_400_000)
    .toISOString()
    .slice(0, 10)

  const hh = String(EVENING_SEND_HOUR).padStart(2, '0')
  return new Date(wallClockToUtc(`${dayBefore}T${hh}:00`, timezone))
}
