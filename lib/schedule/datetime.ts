// Shared timezone conversion for schedule forms and panels.
//
// Every schedule form needs the same round trip: a UTC timestamptz from the
// database has to render in a `datetime-local` input as wall-clock time in the
// tour's timezone, and whatever the TM types has to go back as UTC. Doing that
// per file is how the four separate copies of this logic appeared.
//
// The offset is derived rather than hardcoded, so DST is handled by the
// Intl timezone database instead of by us. 'sv-SE' is used only because it
// formats as `YYYY-MM-DD HH:MM:SS`, which slices cleanly.
//
// Note: this pair is for columns that store a real UTC instant. Do not reach
// for it for naive local date/time columns (hotel check-in and check-out are
// stored that way). See COMPONENTS.md before adding a fifth datetime approach.

/**
 * Converts a UTC ISO string to a `datetime-local` input value
 * (`YYYY-MM-DDTHH:MM`) expressed in the given timezone.
 * Returns an empty string for null/undefined, which is what an empty input wants.
 */
export function toDatetimeLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16)
}

/**
 * Converts a `datetime-local` input value back to a UTC ISO string, reading the
 * input as wall-clock time in the given timezone.
 * Returns null for an empty input so the column can be nulled out.
 */
export function fromDatetimeLocal(local: string | null, tz: string): string | null {
  if (!local) return null
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}
