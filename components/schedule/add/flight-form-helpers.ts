// Pure helpers shared by the Add Flight wizard (add-flight-form.tsx). Split
// out per Brief 32 Phase 2: the wizard file was doing flight search, a
// timetable search, and a manual fallback form all in one 1,000+ line file.
// These have no component state of their own, so they move first with zero
// behaviour risk.

// dep_time_local / arr_time_local are "YYYY-MM-DD HH:MM"; take HH:MM.
export function timeOfDay(local: string | null): string {
  return local ? local.slice(11, 16) : '00:00'
}

// Detects "CX150", "cx 150", "CX-150": a 2-3 letter airline code immediately
// (optionally with a space/dash) followed by digits.
export function detectFlightCode(input: string): { code: string; number: string } | null {
  const m = input.trim().match(/^([A-Za-z]{2,3})\s*-?\s*(\d{1,4})$/)
  if (!m) return null
  return { code: m[1].toUpperCase(), number: m[2] }
}

const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const

export function weekdayCodeFor(dateStr: string): string {
  return DAY_CODES[new Date(`${dateStr}T00:00:00`).getDay()]
}

export const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Departs On Time',
  delayed: 'Delayed',
  cancelled: 'Cancelled',
  departed: 'Departed',
  landed: 'Landed',
}
