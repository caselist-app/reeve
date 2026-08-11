import { TOUR_TIMEZONES } from '@/lib/validators/tour'

/**
 * The browser's IANA timezone, but only when it is one Reeve offers as a tour
 * timezone; otherwise null. Used to pre-fill the timezone selector so a tour is
 * never silently left on the 'UTC' fallback, which renders the day calendar (and
 * its now-marker) an hour or more away from where the TM actually is (REE-119).
 *
 * This must run on the client (in an effect, not during render). On the server
 * Intl reports the host zone, which is UTC on Vercel: the exact wrong answer,
 * and a hydration mismatch if used as an initial state value. It returns null
 * for a detected zone outside TOUR_TIMEZONES rather than guessing, because the
 * selector only holds those options and cannot show a value it does not list.
 */
export function detectBrowserTourTimezone(): string | null {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  return TOUR_TIMEZONES.some((tz) => tz.value === zone) ? zone : null
}
