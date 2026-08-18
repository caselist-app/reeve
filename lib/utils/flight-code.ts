// Detects "CX150", "cx 150", "CX-150": a 2-3 letter airline code immediately
// (optionally with a space/dash) followed by digits. Pure and anchored, so it
// only matches a line that is nothing but a flight code: 'CX150 3pm' does not
// match, deliberately, since the add panel's own time-stripping (parseDayItem)
// reads inline digits as an hour and would corrupt one before it got here.
// Shared by the day add panel (lib/schedule/add-options.ts, REE-99) and the Add
// Flight form's own search box (components/schedule/add/add-flight-form.tsx).
export function detectFlightCode(input: string): { code: string; number: string } | null {
  const m = input.trim().match(/^([A-Za-z]{2,3})\s*-?\s*(\d{1,4})$/)
  if (!m) return null
  return { code: m[1].toUpperCase(), number: m[2] }
}
