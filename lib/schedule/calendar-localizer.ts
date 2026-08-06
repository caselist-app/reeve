// One react-big-calendar localizer that renders a calendar in a named IANA zone.
//
// This file does one thing and should keep doing only that. It exists because
// RBC has no supported way to render a single calendar in a named zone. Its
// luxonLocalizer reads whatever zone the DateTime it is handed carries, and
// every DateTime it builds internally comes from `DateTime.fromJSDate(value)`,
// which defaults to the system zone. So a calendar built from the plain
// luxonLocalizer always renders in the browser's zone, not the tour's.
//
// The two routes to change that, and why this is the one taken:
//
//   1. `Settings.defaultZone = tour.timezone`. This mutates Luxon process-wide.
//      Vercel runs a shared Node process, so one request setting it can render
//      another tour's day in the wrong zone. Rejected. tests/unit/calendar-zone
//      guards against anyone reaching for it: two localizers for two zones in
//      one process must not interfere, which only holds if nothing is global.
//
//   2. Prototype-patch the date library per instance. `Object.create(DateTime)`
//      makes a clone that inherits every static (min, max, local, the lot) and
//      lets us override just `fromJSDate` to pin the zone. Nothing global is
//      touched, so each localizer is independent. This is route 2 from Brief 43
//      and the approach the community actually ships, given PR #2293 (per-zone
//      support in luxonLocalizer) has sat open and unreviewed since 2022.
//
// RBC's own guidance: when the zone changes you must swap the localizer AND
// every Date-based prop (min, max, getNow) together. A TM moving between tours
// in different zones is a real case, so the consuming component rebuilds all of
// them off `timezone` in one go. This file only owns the localizer.

import { DateTime } from 'luxon'
import { luxonLocalizer } from 'react-big-calendar'
import type { DateLocalizer } from 'react-big-calendar'

/**
 * A react-big-calendar localizer that renders every instant in `timezone`
 * (an IANA name such as `Pacific/Auckland`), regardless of the browser's zone.
 *
 * Per instance, no global state. Constructing one for a second zone leaves any
 * existing localizer untouched, which is the property that keeps two tours open
 * in one process from bleeding into each other.
 */
export function createZonedLocalizer(timezone: string): DateLocalizer {
  // Inherit all of DateTime's statics, then pin the zone on the two entry
  // points the localizer uses to turn ambient time into a DateTime.
  const ZonedDateTime = Object.create(DateTime) as typeof DateTime

  // Every render path (gutter labels, block positions, drag results) flows
  // through fromJSDate. Pinning the zone here is what makes the whole calendar
  // agree on wall clock.
  ZonedDateTime.fromJSDate = (date: Date, opts?: { zone?: unknown }) =>
    DateTime.fromJSDate(date, { ...opts, zone: timezone })

  // `local()` feeds the localizer's browser-vs-calendar offset check, which
  // decides multi-day event spans when the calendar zone is east of the
  // browser's. Pinning it too means that comparison uses the tour zone rather
  // than the machine's, so a Pacific/Auckland calendar spans days correctly
  // from a Europe/London browser. The cast is only to satisfy luxon's overloaded
  // static signature; the body just forwards its arguments and re-homes the zone.
  ZonedDateTime.local = ((...args: unknown[]) =>
    (DateTime.local as (...a: unknown[]) => DateTime)(...args).setZone(timezone)) as typeof DateTime.local

  return luxonLocalizer(ZonedDateTime)
}
