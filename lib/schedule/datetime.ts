// Shared timezone conversion for the schedule: forms, panels, server actions
// and the day query. Everything that has to reconcile a stored UTC instant with
// a tour-local calendar day lives here, so there is one technique to review
// rather than a copy per caller.
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
  // 'sv-SE' separates the date and time with a space. A datetime-local input
  // sanitises its value against a *normalised* local date and time string,
  // which requires a 'T', so a space-separated value is discarded and the field
  // renders empty. Saving an empty field then writes null over a real time.
  // The two hand-rolled copies this helper replaced sliced the ISO string
  // directly and so happened to keep the 'T'; this one lost it in the move to
  // being timezone-aware.
  return new Date(iso).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 16).replace(' ', 'T')
}

/**
 * Converts a `datetime-local` input value back to a UTC ISO string, reading the
 * input as wall-clock time in the given timezone.
 *
 * Passes the null-versus-undefined distinction straight through rather than
 * flattening it, because this sits between readForm and a server action and is
 * exactly the kind of helper that would quietly undo the whole convention.
 * Empty input is null, so the column is cleared. A field the form never
 * rendered is undefined, so the action leaves the column alone. Returning null
 * for both would make a datetime impossible to leave untouched by any partial
 * form, which is the bug in Brief 37 with an extra step.
 */
export function fromDatetimeLocal(
  local: string | null | undefined,
  tz: string,
): string | null | undefined {
  if (local === undefined) return undefined
  if (!local) return null
  return wallClockToUtc(local, tz)
}

/**
 * `YYYY-MM-DDTHH:MM` read as wall-clock time in the given timezone, returned as
 * a UTC ISO string. The non-nullable core of `fromDatetimeLocal`, split out so
 * callers that always have a value do not have to narrow away a null the
 * function cannot return.
 */
export function wallClockToUtc(local: string, tz: string): string {
  const ref = new Date(`${local}:00.000Z`)
  const localStr = ref.toLocaleString('sv-SE', { timeZone: tz }).slice(0, 19)
  const localAsUtc = new Date(`${localStr.replace(' ', 'T')}.000Z`)
  const offsetMs = ref.getTime() - localAsUtc.getTime()
  return new Date(ref.getTime() + offsetMs).toISOString()
}

/**
 * The calendar date (`YYYY-MM-DD`) a stored UTC instant falls on in the given
 * timezone. This is the answer to "which day of the tour is this?", and it is
 * not the same as the instant's UTC date: 22:00Z on 14 June is 15 June in
 * Auckland, so a segment departing then belongs to the 15th on the schedule.
 */
export function localDateInZone(iso: string, tz: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: tz }).slice(0, 10)
}

/**
 * The wall-clock time (`HH:MM`) a stored UTC instant reads as in the given
 * timezone. Used when a record moves to another date and its times have to be
 * re-derived against the new day rather than shifted by a fixed offset, so a
 * move across a DST boundary keeps load-in at 10:00 instead of 09:00.
 */
export function localTimeInZone(iso: string, tz: string): string {
  return new Date(iso).toLocaleString('sv-SE', { timeZone: tz }).slice(11, 16)
}

/**
 * The half-open UTC window `[start, end)` covering one tour-local calendar day.
 * Filtering a timestamptz column by a day means filtering by this, never by
 * `${date}T00:00:00Z` to the next: those are the same only for a tour on UTC,
 * and silently wrong by one day at the edges for every other tour.
 */
export function localDayWindowUtc(date: string, tz: string): { start: string; end: string } {
  const nextDate = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86_400_000)
    .toISOString()
    .slice(0, 10)

  return {
    // Midnight local exists on every day this product cares about. A DST
    // transition that skips it (Lord Howe, some Brazilian zones historically)
    // would shift this by an hour, which is a tolerable error for a day
    // boundary and not worth an hour-scanning fallback.
    start: wallClockToUtc(`${date}T00:00`, tz),
    end: wallClockToUtc(`${nextDate}T00:00`, tz),
  }
}
