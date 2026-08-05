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
  // Selected from day_items directly rather than through an embed on shows, so
  // this function does not dictate the caller's query shape.
  //
  // Brief 42: a show can hold two load-ins now, and the planner has to pick one.
  // The EARLIEST is the answer, and that is not arbitrary. This value is what
  // door_to_site_at is ranked against, so it is "when must crew be on site by".
  // A second load-in later in the day does not relax the first one, and ranking
  // against it would call a flight feasible that lands after the crew were due.
  // Ordering ascending with nulls last and taking the first row is that rule.
  const { data, error } = await supabase
    .from('day_items')
    .select('starts_at')
    .eq('show_id', showId)
    .eq('kind', 'load_in')
    .not('starts_at', 'is', null)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // A failed read reads as "no load-in set", which makes every option feasible
  // rather than none, so it has to be visible. Logged rather than thrown: the
  // planner ranking is not worth taking a page down for, and the caller already
  // handles a null by not filtering on feasibility.
  if (error) {
    console.error('[load-in] could not read the show load-in:', error.message, { showId })
    return null
  }

  // A show with no load-in row is not an error, it is a show whose TM has not
  // set one yet. Every show starts in exactly that state.
  return data?.starts_at ?? null
}
