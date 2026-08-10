import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'
import { createDayItem } from '@/lib/actions/day-items'
import { renderItinerary } from '@/lib/comms/templates/itinerary'

// REE-20, Brief 42. The comms repoint, checked end to end through /itinerary.
//
// Two rules and one failure mode, and the failure mode is the reason this file
// is here rather than in the unit suite. tests/unit/day-item-lines.test.ts
// already proves the line formatter start-only-except-catering rule against a
// hardcoded formatter, with no database. What it cannot prove is the three
// things that only exist once a real template renders a real row:
//
//   1. The tour's timezone reaches the formatter, so a load-in typed as 10:00
//      is told to crew as 10:00 and not as its UTC instant. A unit test that
//      passes its own formatter cannot catch a template that formats in the
//      wrong zone, because it never calls the template.
//   2. Catering surfaces both ends through that same real render, not just
//      through the pure function.
//   3. A day_items query error makes the template say it could not load, rather
//      than answering a crew member with a show that has no times. This is the
//      one that has shipped broken before: every crew-facing template used to
//      discard its query error, so a failed read rendered as a confident,
//      plausible, wrong "nothing here". It is the assertion to watch.
//
// THE FIXTURE TIMEZONE IS NEVER UTC, DELIBERATELY. Europe/London in June is
// BST, an hour off UTC; Pacific/Auckland in June is NZST, twelve hours off and
// on the other side. A template that formatted in UTC would round-trip to 10:00
// only for a tour actually on UTC, so both zones below would catch it: London
// would read 09:00 and Auckland 22:00 the day before. Running every assertion
// under both is what turns "reads the right column" into "tells the crew the
// right time".

// Future date, because /itinerary answers with the active or next UPCOMING
// show and today is 2026. A June date on both zones keeps the tour off UTC. The
// same 2030 date one-load-in.test.ts uses, and for the same reason.
const DATE = '2030-06-14'

// Two clocks that are the whole point of decision 3. A load-in with a fifteen
// minute end reads as a window that shuts when it is really a start with an
// estimate on it, so comms surface the start alone. A dinner window that does
// not say when it closes is worse than useless, so catering surfaces both.
const LOAD_IN_START = '10:00'
const LOAD_IN_END = '10:15'
const DINNER_START = '18:00'
const DINNER_END = '21:00'

// The value fetchShowItems returns on failure. The point is not what it says,
// it is that the template reads `error` at all: before REE-20 it did not, and
// the crew member got "No upcoming shows on this tour" for a query that failed.
type QueryResult = { data: null; error: { message: string } }

// A day_items query that resolves to an error, standing in for the real
// production failure: Brief 36 step 3 dropped two columns, Trigger.dev kept
// selecting them, and PostgREST rejected the read with 42703 while Vercel
// looked healthy. There is no clean way to make a healthy database reject a
// valid select, so the error is injected at the one table under test and every
// other read (tours, the show itself) goes to the real database untouched.
//
// A Proxy rather than a hand-written builder, because fetchShowItems chains
// .select().eq().order().order() and then awaits, so every method has to return
// something chainable and the whole thing has to be thenable. Returning the
// proxy from every method call gives the chain; special-casing `then` gives the
// await its error result.
function erroringDayItemsQuery(message: string) {
  const outcome: QueryResult = { data: null, error: { message } }
  const proxy: unknown = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          return (
            onFulfilled: (value: QueryResult) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve(outcome).then(onFulfilled, onRejected)
        }
        return () => proxy
      },
    },
  )
  return proxy as ReturnType<typeof testDb.from>
}

async function addItem(
  fixture: Fixture,
  kind: string,
  startClock: string,
  endClock: string,
) {
  const result = await createDayItem({
    tour_id: fixture.tourId,
    tour_date_id: fixture.tourDateId,
    show_id: fixture.showId,
    kind,
    start_clock: startClock,
    end_clock: endClock,
  })
  if (result.error) throw new Error(`could not add the ${kind}: ${result.error}`)
}

// Every assertion, under both a positive and a negative UTC offset. describe.each
// keeps the two runs identical rather than copied, so a rule can only be right
// in one zone and wrong in the other if the template itself is zone-dependent,
// which is exactly the bug being hunted.
describe.each([['Europe/London'], ['Pacific/Auckland']])(
  'comms surface the start time (%s)',
  (timezone) => {
    let fixture: Fixture

    beforeEach(async () => {
      fixture = await createFixture({ date: DATE, timezone })
    })

    afterEach(async () => {
      // Restore before teardown so a spy from the failed-read test cannot bleed
      // into destroyFixture or the next case.
      vi.restoreAllMocks()
      await destroyFixture(fixture)
    })

    it('renders a load-in as its start with no range, and catering as both ends', async () => {
      // Set once, through the one writer, exactly as a TM would from the day
      // view. A load-in with an end the crew must not see, and a dinner with an
      // end the crew must see.
      await addItem(fixture, 'load_in', LOAD_IN_START, LOAD_IN_END)
      await addItem(fixture, 'catering_dinner', DINNER_START, DINNER_END)

      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      // The start reaches the crew, in the tour's zone. If this read the UTC
      // instant it would be 09:00 on London and 22:00 on Auckland, so the plain
      // 10:00 is the whole timezone claim of the brief in one line.
      expect(itinerary).toContain(`Load-in: ${LOAD_IN_START}`)

      // And the end does not. surfaceEndInComms is false for load_in, so the
      // fifteen minute estimate never appears: its absence is how "start, not a
      // range" is asserted without depending on the exact surrounding text.
      expect(itinerary).not.toContain(LOAD_IN_END)

      // Catering is the carve-out, and the end is the entire point of it. Both
      // ends, in the tour's zone, as one line.
      expect(itinerary).toContain(`Dinner: ${DINNER_START} to ${DINNER_END}`)
    })

    it('says it could not load when the day_items read fails, not that there is nothing there', async () => {
      // No items seeded: the failure is the point, not the contents. The show
      // itself still exists and its lookup still succeeds, so the template gets
      // as far as reading the day and then hits the injected error.
      // Cast past the overloaded literal-union signature of `from`: the spy
      // needs to branch on an arbitrary relation name, which the typed overloads
      // deliberately do not allow.
      const realFrom = testDb.from.bind(testDb) as (
        relation: string,
      ) => ReturnType<typeof testDb.from>
      const brokenFrom = ((relation: string) =>
        relation === 'day_items'
          ? erroringDayItemsQuery('injected: day_items read failed')
          : realFrom(relation)) as typeof testDb.from
      vi.spyOn(testDb, 'from').mockImplementation(brokenFrom)

      const itinerary = await renderItinerary(fixture.personId, fixture.tourId)

      // The failure is admitted. A crew member who is told this tries again; a
      // crew member told "nothing here" turns up to an empty page and trusts it.
      expect(itinerary).toContain('Could not load')

      // And the two confident wrong answers are both ruled out: the show was
      // found, so this is not the empty-tour reply, and the read failed, so it
      // is not the show-with-no-times reply either.
      expect(itinerary).not.toContain('No upcoming shows')
      expect(itinerary).not.toContain('No times set')
    })
  },
)
