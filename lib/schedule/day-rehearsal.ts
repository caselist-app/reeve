import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'

type Client = Awaited<ReturnType<typeof createClient>>

export type DayRehearsal = Pick<Tables<'rehearsals'>, 'id' | 'location_name'>

const REHEARSAL_SELECT = 'id, location_name'

// The rehearsal to show in the day info block. Unlike hotel_stays,
// tour_date_id on rehearsals is not null (every rehearsal is created together
// with its tour_dates row via createRehearsal), so this is a direct link
// lookup with no date-matched fallback to reach for.
export async function resolveRehearsalForDay(
  supabase: Client,
  { tourId, tourDateId }: { tourId: string; tourDateId: string | null },
): Promise<DayRehearsal | null> {
  if (!tourDateId) return null

  const { data } = await supabase
    .from('rehearsals')
    .select(REHEARSAL_SELECT)
    .eq('tour_id', tourId)
    .eq('tour_date_id', tourDateId)
    .maybeSingle()

  return data ?? null
}
