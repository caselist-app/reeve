import { createAdminClient } from '@/lib/supabase/admin'
import { localDateInZone } from '@/lib/schedule/datetime'

// /itinerary slash command. Zero-AI template render.
// Returns the full day sheet for the next (or current) show.

// Times render in the tour's timezone, not UTC.
//
// They used to render in UTC, which is correct only for a tour on UTC and an hour
// out for a UK tour in summer. A TM typing load-in as 10:00 had the crew told
// 09:00, which is the same failure Brief 36 exists to remove (a crew member sent
// a time the TM cannot see anywhere on their schedule) arriving by a different
// route than a duplicated column. Found while collapsing load_in_at into the day
// sheet, 2026-08-04.
function formatTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  })
}

function formatDateTime(iso: string | null, tz: string): string {
  if (!iso) return 'TBC'
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })} ${formatTime(iso, tz)}`
}

// How long after its own date a show stays the "active" show.
//
// This replaces a filter on shows.curfew_at, which was an absolute instant the
// Venue tab's datetime-local could put at 03:00 the following morning. Under
// Brief 36 step 3 the surviving column is day_sheets.curfew, and updateDaySheet
// pins every day-sheet time to the show's own date, so a 02:00 curfew stores as
// 02:00 ON the show day, twenty hours before the show. Filtering on that would
// have made a show stop being active before it started.
//
// A fixed window is also better than the column was: it does not depend on the TM
// having entered a curfew at all, and a crew member messaging at 01:00 wants
// tonight's show whether or not anyone recorded when it ends. Matt's decision,
// 2026-08-04.
const SHOW_STAYS_ACTIVE_UNTIL_HOUR = 6

export async function renderItinerary(
  person_id: string,
  tour_id: string
): Promise<string> {
  const admin = createAdminClient()

  // The tour's timezone decides both which day it is for this crew member and how
  // every time below reads. A tour with none set falls back to UTC, which is what
  // every other schedule read does.
  const { data: tour } = await admin
    .from('tours')
    .select('timezone')
    .eq('id', tour_id)
    .single()

  const timezone = tour?.timezone ?? 'UTC'

  // Find the active or next upcoming show.
  //
  // A show that runs past midnight is still the active show, so "today" here is
  // the tour-local day minus the grace window rather than the calendar day: a
  // crew member messaging at 01:00 gets last night's show, which is the one they
  // are still working.
  //
  // Both the filter and the order sit on shows' own columns, deliberately. The
  // previous version filtered on curfew_at, and repointing that at the day sheet
  // would have meant filtering a parent table by an embedded one, which in
  // PostgREST does not filter the parent rows at all and cannot be ordered by.
  // That is the exact shape that made /travel and /hotel answer "nothing
  // upcoming" while data existed. Selecting from the table being ranked keeps it
  // impossible here.
  const now = new Date()
  const graceStart = new Date(now.getTime() - SHOW_STAYS_ACTIVE_UNTIL_HOUR * 60 * 60 * 1000)
  const earliestActiveDate = localDateInZone(graceStart.toISOString(), timezone)

  const { data: shows, error: showsError } = await admin
    .from('shows')
    // day_sheets is a plain embed being read, not filtered, so !inner would be
    // wrong here: it would drop a show whose day sheet row is somehow missing
    // rather than rendering it with times TBC, and losing the show entirely is the
    // worse of the two failures.
    .select('id, venue_name, date, address, day_sheets(*)')
    .eq('tour_id', tour_id)
    .gte('date', earliestActiveDate)
    .order('date', { ascending: true })
    .limit(1)

  // A failed query and an empty tour are not the same answer, and until 2026-08-04
  // this code could not tell a crew member apart from a crew member. Every one of
  // these templates discarded the error, so any failure rendered as "No upcoming
  // shows on this tour", which is a confident, wrong, and completely plausible
  // reply.
  //
  // That is exactly how this presented in production the day Brief 36 step 3
  // shipped: the migration dropped shows.load_in_at and shows.curfew_at, Vercel
  // redeployed, and Trigger.dev did not. /itinerary only ever runs on
  // Trigger.dev (lib/comms/router.ts is reached from trigger/jobs/*-router.ts and
  // from nowhere on Vercel), so it kept selecting two dropped columns, PostgREST
  // rejected the query with 42703, and the crew member was told the tour had no
  // shows. Nothing in any log said otherwise.
  //
  // Logged rather than thrown: the job has already accepted the message, so
  // throwing loses the reply entirely. The log line is what makes the Trigger.dev
  // run readable, and it is the only place this failure is visible.
  if (showsError) {
    console.error('[itinerary] show lookup failed:', showsError.message, { tour_id })
    return 'Could not load the itinerary just now. Try again in a moment.'
  }

  const show = shows?.[0]

  if (!show) return 'No upcoming shows on this tour.'

  // One row per show, but PostgREST types a to-one embed as an array in some
  // shapes, so both are handled the way lib/ai/context.ts already does.
  const daySheet = Array.isArray(show.day_sheets)
    ? (show.day_sheets[0] ?? null)
    : (show.day_sheets ?? null)

  const lines: string[] = [
    `*${show.venue_name}*`,
    show.address ?? '',
    ``,
    `Venue access: ${formatDateTime(daySheet?.venue_access ?? null, timezone)}`,
    `Load in: ${formatTime(daySheet?.load_in ?? null, timezone)}`,
    `Line check: ${formatTime(daySheet?.line_check ?? null, timezone)}`,
    `Soundcheck: ${formatTime(daySheet?.soundcheck ?? null, timezone)}`,
    `Doors: ${formatTime(daySheet?.doors ?? null, timezone)}`,
    `Support on: ${formatTime(daySheet?.support_on ?? null, timezone)}`,
    `Headliner on: ${formatTime(daySheet?.headliner_on ?? null, timezone)}`,
    `Curfew: ${formatTime(daySheet?.curfew ?? null, timezone)}`,
    `Load out: ${formatTime(daySheet?.load_out ?? null, timezone)}`,
  ].filter(Boolean)

  return lines.join('\n')
}
