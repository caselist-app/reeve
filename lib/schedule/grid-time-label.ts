// The formatter RBC's `formats` prop uses for gutter labels, the live drag
// selection preview, and event tooltips (`eventTimeRangeFormat` and its
// start/end-only siblings). Pulled out so a Node test can reach it, the same
// reason as event-chip-label.ts: day-calendar.tsx imports react-big-calendar
// and its stylesheet, which have no jsdom/CSS loader.
//
// Left to RBC's own default, `eventTimeRangeFormat` formats through the
// luxon localizer's unpinned `t` token, which resolves via the ambient Intl
// locale of whichever environment renders it: Node's default locale on the
// server, the browser's on the client. Those can disagree on 12h vs 24h
// (e.g. "7:30 AM" vs "07:30"), which showed up as a hydration mismatch on the
// block's native `title` attribute, not just a display slip, since the SSR
// pass and the client render produce different strings for the same event.
// `localTimeInZone` sidesteps this the same way it already does for the
// gutter: a fixed locale (`sv-SE`, chosen only for its HH:MM slicing) rather
// than an environment-dependent one.
import { localTimeInZone } from '@/lib/schedule/datetime'
import { fromGridInstant } from '@/lib/schedule/day-window'

/** The real wall-clock label (`HH:MM`) a grid-space instant stands for. */
export function gridInstantLabel(instant: Date, timezone: string): string {
  return localTimeInZone(fromGridInstant(instant.toISOString(), timezone), timezone)
}

/** A "start – end" range of two grid-space instants, in real wall-clock time. */
export function gridRangeLabel(start: Date, end: Date, timezone: string): string {
  return `${gridInstantLabel(start, timezone)} – ${gridInstantLabel(end, timezone)}`
}
