import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Called after the entity that defines a day's type (a show or a rehearsal)
// is removed. Both createShow (via the create_show_with_dependents RPC) and
// createRehearsal upsert tour_dates.day_type as a side effect of creating
// their row. Without this, deleting that row leaves the day permanently
// stuck showing a type for something that no longer exists: an orphaned
// tour_dates.day_type with nothing behind it.
//
// Picks a sensible fallback (travel if transport is already linked to the
// date, otherwise day off) and clears any custom_title, since a title set
// while the show or rehearsal existed is almost always naming the thing that
// just disappeared.
//
// Guarded by re-reading the current day_type first: only reverts if it still
// matches removedType, so it never clobbers a type the TM has since set
// deliberately through some other path.
export async function revertDayTypeIfOrphaned(
  supabase: SupabaseClient<Database>,
  tourDateId: string,
  removedType: 'show' | 'rehearsal'
): Promise<void> {
  const { data: tourDate } = await supabase
    .from('tour_dates')
    .select('day_type')
    .eq('id', tourDateId)
    .single()

  if (!tourDate || tourDate.day_type !== removedType) return

  const { data: segment } = await supabase
    .from('transport_segments')
    .select('id')
    .eq('tour_date_id', tourDateId)
    .limit(1)
    .maybeSingle()

  const fallback = segment ? 'travel' : 'day_off'

  await supabase
    .from('tour_dates')
    .update({ day_type: fallback, custom_title: null })
    .eq('id', tourDateId)
}
