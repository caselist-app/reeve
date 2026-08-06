// Prefetch policy for date navigation.
//
// Next only prefetches a dynamic route as far as the nearest loading.tsx, and
// the schedule has one, so a default <Link> prefetch warms the skeleton and
// none of the actual day. prefetch={true} fetches the full RSC payload, which
// is what makes the click feel instant.
//
// Doing that for every date would fire one full payload request per day on
// mount: a 60-date tour would hammer Supabase with 60 day views nobody asked
// for. So it is windowed. A TM works forwards through a tour, so the days
// either side of the selection are the near-certain next click, and everything
// beyond the window keeps Next's default behaviour.

export const DESKTOP_PREFETCH_WINDOW = 7

// Tighter on mobile: the strip renders every date in one scroller, and mobile
// is more often on metered or slow connections.
export const MOBILE_PREFETCH_WINDOW = 3

/**
 * Returns the `prefetch` value for a date link.
 *
 * `true` fetches the full day payload. `undefined` leaves Next's default
 * (prefetch to the loading boundary when the link enters the viewport), which
 * is deliberately not `false`: far-off dates should still warm their skeleton.
 */
export function datePrefetch(
  index: number,
  selectedIndex: number,
  window: number,
): true | undefined {
  if (selectedIndex < 0) return undefined
  return Math.abs(index - selectedIndex) <= window ? true : undefined
}
