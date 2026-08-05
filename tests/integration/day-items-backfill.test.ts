import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { testDb } from './test-db'
import { createFixture, destroyFixture, type Fixture } from './fixture'

// Brief 42 step 1. A day stops being twenty fixed columns on one day_sheets row
// and becomes rows in day_items. This proves the move, which is the only part of
// the brief that touches data a TM has already entered.
//
// Two things about the shape of this file, both deliberate and both worth
// reading before changing it.
//
// 1. The backfill is a callable function, not inline migration SQL, and this
//    test is why. Integration fixtures are created AFTER every migration has
//    run, so a backfill that only ever executes inside the migration has
//    nothing to act on by the time a test can insert a day sheet. The named
//    test in the brief ("a fixture show with load_in, curfew and
//    catering_dinner set yields exactly three day_items rows") cannot pass
//    against inline SQL: it would read zero rows every time. So the expand
//    migration puts the logic in backfill_day_items(p_tour_id) and calls it
//    once with null for the whole database, and this test calls it scoped to
//    one tour. Step 8 drops the function with the old tables.
//
// 2. Every query here goes through raw PostgREST rather than the typed client.
//    lib/types/database.ts cannot know about day_items until the migration has
//    been applied and pnpm types:gen has run, and hand-editing that file is
//    forbidden. A typed test would therefore fail to COMPILE before the
//    migration exists, when what it should do is fail on a missing relation.
//    Raw PostgREST gets the red the brief asks for: a missing relation, then
//    the count.

const DATE = '2026-06-14'
const TIMEZONE = 'Europe/London'

// London in June is UTC+1, so these are the instants behind 10:00, 01:30 the
// next morning, and an 18:00 to 19:30 dinner. Written as UTC deliberately: a
// day sheet column is a timestamptz and the backfill must carry the instant
// across untouched, not reinterpret it.
const LOAD_IN_UTC = '2026-06-14T09:00:00Z'
const CURFEW_UTC = '2026-06-15T00:30:00Z'
const DINNER_START_UTC = '2026-06-14T17:00:00Z'
const DINNER_END_UTC = '2026-06-14T18:30:00Z'

// The fourteen instant columns on day_sheets, and the three catering pairs.
// Listed here rather than imported because the point of this test is to check
// the migration against the schema as it actually is, and importing the app's
// own list would let one wrong list satisfy both sides.
const INSTANT_COLUMNS = [
  'lobby_call',
  'venue_access',
  'load_in',
  'line_check',
  'soundcheck',
  'vip',
  'doors',
  'support_on',
  'support_off',
  'changeover',
  'headliner_on',
  'headliner_off',
  'curfew',
  'load_out',
] as const

const CATERING_PAIRS = [
  ['catering_breakfast_start', 'catering_breakfast_end'],
  ['catering_lunch_start', 'catering_lunch_end'],
  ['catering_dinner_start', 'catering_dinner_end'],
] as const

interface DayItemRow {
  id: string
  tour_id: string
  tour_date_id: string
  show_id: string | null
  kind: string
  title: string | null
  starts_at: string | null
  ends_at: string | null
}

interface BackfillCounts {
  items_created: number
  tour_dates_created: number
  catering_pairs_skipped: number
  event_ends_dropped: number
}

const restUrl = () => process.env.SUPABASE_TEST_URL ?? ''
const serviceKey = () => process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? ''

function headers() {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    'Content-Type': 'application/json',
  }
}

async function rest(path: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${restUrl()}/rest/v1/${path}`, { headers: headers() })
  return { status: res.status, body: await res.json() }
}

// Fails loudly rather than returning a shape the caller has to check, because a
// backfill that did not run should stop this file rather than let every
// assertion below report zero rows and read as a data problem.
async function runBackfill(tourId: string): Promise<BackfillCounts> {
  const res = await fetch(`${restUrl()}/rest/v1/rpc/backfill_day_items`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ p_tour_id: tourId }),
  })
  const body = await res.json()
  if (res.status !== 200) {
    throw new Error(`backfill_day_items failed with ${res.status}: ${JSON.stringify(body)}`)
  }
  // A `returns table` function comes back as an array of one row.
  const row = Array.isArray(body) ? body[0] : body
  if (!row) throw new Error('backfill_day_items returned no counts')
  return row as BackfillCounts
}

async function itemsForTour(tourId: string): Promise<DayItemRow[]> {
  const { status, body } = await rest(
    `day_items?tour_id=eq.${tourId}&select=id,tour_id,tour_date_id,show_id,kind,title,starts_at,ends_at&order=kind`,
  )
  if (status !== 200) {
    throw new Error(`could not read day_items (${status}): ${JSON.stringify(body)}`)
  }
  return body as DayItemRow[]
}

describe('the backfill moves a day sheet into day items', () => {
  let fixture: Fixture

  beforeEach(async () => {
    fixture = await createFixture({ date: DATE, timezone: TIMEZONE })

    const { error } = await testDb
      .from('day_sheets')
      .update({
        load_in: LOAD_IN_UTC,
        curfew: CURFEW_UTC,
        catering_dinner_start: DINNER_START_UTC,
        catering_dinner_end: DINNER_END_UTC,
      })
      .eq('show_id', fixture.showId)
    if (error) throw new Error(`could not set the day sheet: ${error.message}`)
  })

  afterEach(async () => {
    await destroyFixture(fixture)
  })

  // Computed from the row the test just wrote rather than hardcoded, so a
  // fixture that quietly stops setting one of these fails the count instead of
  // agreeing with a number written twice.
  async function expectedItemCount(): Promise<number> {
    const { data, error } = await testDb
      .from('day_sheets')
      .select('*')
      .eq('show_id', fixture.showId)
      .single()
    if (error || !data) throw new Error(`could not read the day sheet: ${error?.message}`)

    const sheet = data as unknown as Record<string, string | null>

    const instants = INSTANT_COLUMNS.filter((c) => sheet[c] !== null).length
    const pairs = CATERING_PAIRS.filter(
      ([start, end]) => sheet[start] !== null || sheet[end] !== null,
    ).length

    if (instants + pairs === 0) {
      throw new Error('the fixture day sheet holds no times, so this test would prove nothing')
    }
    return instants + pairs
  }

  it('creates one row per time, and no more', async () => {
    const expected = await expectedItemCount()
    expect(expected).toBe(3)

    const counts = await runBackfill(fixture.tourId)
    const items = await itemsForTour(fixture.tourId)

    expect(items).toHaveLength(expected)
    expect(counts.items_created).toBe(expected)
  })

  it('carries an instant across with no end, and a catering pair with both', async () => {
    await runBackfill(fixture.tourId)
    const items = await itemsForTour(fixture.tourId)

    const loadIn = items.find((i) => i.kind === 'load_in')
    const dinner = items.find((i) => i.kind === 'catering_dinner')
    const curfew = items.find((i) => i.kind === 'curfew')
    if (!loadIn || !dinner || !curfew) {
      throw new Error(
        `expected load_in, catering_dinner and curfew, got ${items.map((i) => i.kind).join(', ')}`,
      )
    }

    // The instant itself, not just "something is there". A backfill that
    // rebuilt the timestamp from the date would pass a null check and be a day
    // or an hour out.
    expect(new Date(loadIn.starts_at ?? '').toISOString()).toBe(new Date(LOAD_IN_UTC).toISOString())
    expect(loadIn.ends_at).toBeNull()

    expect(new Date(dinner.starts_at ?? '').toISOString()).toBe(
      new Date(DINNER_START_UTC).toISOString(),
    )
    expect(new Date(dinner.ends_at ?? '').toISOString()).toBe(new Date(DINNER_END_UTC).toISOString())

    // The 01:30 curfew keeps its own instant, which is on 15 June, while
    // belonging to the 14 June show. That is the whole reason day_items has a
    // day link and no date column of its own.
    expect(new Date(curfew.starts_at ?? '').toISOString()).toBe(new Date(CURFEW_UTC).toISOString())
  })

  it('puts every row on the show it came from, and on that show day', async () => {
    await runBackfill(fixture.tourId)
    const items = await itemsForTour(fixture.tourId)

    for (const item of items) {
      expect(item.tour_date_id).toBe(fixture.tourDateId)
      expect(item.show_id).toBe(fixture.showId)
      expect(item.tour_id).toBe(fixture.tourId)
    }
  })

  it('runs twice without duplicating anything', async () => {
    // The Supabase migration history is out of sync, so a migration being
    // applied more than once is a live possibility rather than a hypothetical.
    const first = await runBackfill(fixture.tourId)
    const second = await runBackfill(fixture.tourId)

    expect(first.items_created).toBe(3)
    expect(second.items_created).toBe(0)
    expect(await itemsForTour(fixture.tourId)).toHaveLength(3)
  })

  describe('a freeform day event', () => {
    it('becomes an other item with its title and a resolved day', async () => {
      const { error } = await testDb.from('day_events').insert({
        tour_id: fixture.tourId,
        show_id: fixture.showId,
        date: DATE,
        title: 'Meet and greet',
        starts_at: '2026-06-14T16:30:00Z',
        location: 'Green room',
      })
      if (error) throw new Error(`could not create the day event: ${error.message}`)

      await runBackfill(fixture.tourId)
      const items = await itemsForTour(fixture.tourId)

      const other = items.find((i) => i.kind === 'other')
      if (!other) throw new Error('the day event did not become a day item')

      expect(other.title).toBe('Meet and greet')
      expect(other.tour_date_id).toBe(fixture.tourDateId)
      expect(new Date(other.starts_at ?? '').toISOString()).toBe(
        new Date('2026-06-14T16:30:00Z').toISOString(),
      )

      // Three day-sheet items plus this one.
      expect(items).toHaveLength(4)
    })

    it('gets its day created when the tour has no row for that date', async () => {
      // day_events is placed by `date` alone and is the only timeline source off
      // the day link, so a row on a date the tour does not list is reachable
      // today. Matt's call, 2026-08-04: create the day rather than drop the row.
      // resolveTourDateId already behaves this way on every other path.
      const orphanDate = '2026-06-20'

      const { data: existing } = await testDb
        .from('tour_dates')
        .select('id')
        .eq('tour_id', fixture.tourId)
        .eq('date', orphanDate)
        .maybeSingle()
      if (existing) throw new Error('the orphan date already exists, so this test proves nothing')

      const { error } = await testDb.from('day_events').insert({
        tour_id: fixture.tourId,
        date: orphanDate,
        title: 'Radio session',
        starts_at: '2026-06-20T10:00:00Z',
      })
      if (error) throw new Error(`could not create the orphan day event: ${error.message}`)

      const counts = await runBackfill(fixture.tourId)
      expect(counts.tour_dates_created).toBe(1)

      const { data: created, error: createdError } = await testDb
        .from('tour_dates')
        .select('id, day_type')
        .eq('tour_id', fixture.tourId)
        .eq('date', orphanDate)
        .single()
      if (createdError || !created) {
        throw new Error(`the day was not created: ${createdError?.message}`)
      }

      // The table default, the same value resolveTourDateId leaves when the
      // caller cannot say what kind of day it is. Guessing 'press' would put a
      // chip in the Dates sidebar the TM never chose.
      expect(created.day_type).toBe('day_off')

      const items = await itemsForTour(fixture.tourId)
      const session = items.find((i) => i.title === 'Radio session')
      if (!session) throw new Error('the orphan day event was not backfilled')
      expect(session.tour_date_id).toBe(created.id)
    })
  })

  it('skips a catering end with no start, and says how many it skipped', async () => {
    // day_items_end_needs_start rejects an end with no start, so a half-filled
    // catering pair cannot become a row. Counted and reported rather than
    // dropped in silence, because the count is the only way Matt sees it.
    const { error } = await testDb
      .from('day_sheets')
      .update({ catering_lunch_start: null, catering_lunch_end: '2026-06-14T12:30:00Z' })
      .eq('show_id', fixture.showId)
    if (error) throw new Error(`could not set the half pair: ${error.message}`)

    const counts = await runBackfill(fixture.tourId)

    expect(counts.catering_pairs_skipped).toBe(1)

    const items = await itemsForTour(fixture.tourId)
    expect(items.map((i) => i.kind)).not.toContain('catering_lunch')
    // The other three still landed, so the skip is one pair and not the run.
    expect(items).toHaveLength(3)
  })
})
