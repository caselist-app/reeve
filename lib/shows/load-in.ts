import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Brief 36 step 3. shows.load_in_at and day_sheets.load_in both meant "when is
// load-in". The Venue tab wrote the first, the Schedule tab wrote the second, and
// nothing synced them, so the planner's feasibility ranking and the timeline the
// TM was looking at could disagree about when the crew had to be on site.
//
// Matt's call, 2026-08-04: a show has times, the day sheet is those times, and
// everything else feeds off it. This is the "everything else feeds off it" part,
// in one function, so the planner's server action and the planner page cannot
// drift the way the two columns did. Two callers reading one column through one
// function is the whole point; adding a third caller means calling this, not
// writing the query again.

type Client = SupabaseClient<Database>

/**
 * When crew must be on site for this show, as a UTC ISO string, or null if the
 * TM has not set a load-in yet.
 *
 * This is the value the planner ranks feasibility against: `door_to_site_at`
 * (arrival plus transit plus ground) is compared directly to it, so callers must
 * not subtract transit time before or after, or it gets counted twice.
 */
export async function requiredSiteArrivalFor(
  supabase: Client,
  showId: string,
): Promise<string | null> {
  // Selected from day_sheets directly rather than through an embed on shows.
  // There is one row per show, so this is the same single round trip, and it
  // keeps the caller free to fetch whatever else it needs from shows without
  // this function dictating that query's shape.
  const { data } = await supabase
    .from('day_sheets')
    .select('load_in')
    .eq('show_id', showId)
    .maybeSingle()

  // maybeSingle rather than single: a show with no day sheet row is not an error
  // here, it is a show with no load-in. create_show_with_dependents always
  // inserts the row, so this is the defensive branch rather than the common one.
  return data?.load_in ?? null
}
