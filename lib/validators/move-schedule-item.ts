import { z } from 'zod'

// Action-facing schema for a drag or resize on the schedule calendar. REE-54,
// Brief 43 step 3.
//
// THE INSTANTS ARE INSTANTS, NOT DAYS, and that is the one contract decision in
// this file. react-big-calendar's onEventDrop / onEventResize hand back JS Dates;
// the caller sends `date.toISOString()`. The action derives which day the
// instant falls on itself, server side, through resolveTourDateId() and
// localDateInZone(). Nothing here, and nothing that reached here, asked RBC or
// Luxon which day something is on: RBC's named-timezone support rests on an
// unmerged four-year-old PR and a prototype Luxon patch, so its notion of a day
// is the least trustworthy thing in the stack. A wrong display zone shows a TM
// wrong times, which is visible and complainable; it cannot silently write the
// wrong day. See lib/schedule/calendar-adapter.ts, which produces this payload.
//
// No .default() on anything, and check:conventions fails one in lib/validators/.

// ISO 8601 UTC. `.toISOString()` produces `2026-06-14T09:00:00.000Z`, which
// z.datetime() accepts. Rejecting an offset form is deliberate: the payload is
// built from a JS Date, so anything else means a caller assembled the string by
// hand and is about to store an ambiguous instant.
const instant = z.string().datetime()

// endsAt is nullable AND optional, and both mean the same thing on purpose: no
// stated end. fromDropOrResize returns null when a move never turned a
// synthesised end into a real one, and the action skips the end column rather
// than writing null over it. This inverts the usual null-means-cleared
// convention, locally and deliberately, because a move must never invent or
// clear an end. lib/schedule/calendar-adapter.ts is where that rule is set.
const endInstant = instant.nullable().optional()

const base = {
  // The row being moved, in its own table. Which table is the `source`
  // discriminant below.
  id: z.string().uuid(),
  startsAt: instant,
  endsAt: endInstant,
}

// A discriminated union on source, so the action dispatches to the right write
// path. The three branches share a shape today; keeping them separate is what
// lets a per-source field (a hotel discriminator, say) be added later without
// widening the other two.
export const moveScheduleItemSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('day_item'), ...base }),
  z.object({ source: z.literal('segment'), ...base }),
  z.object({ source: z.literal('hotel'), ...base }),
])

export type MoveScheduleItemInput = z.infer<typeof moveScheduleItemSchema>
