import type { createClient } from '@/lib/supabase/server'
import type { Tables } from '@/lib/types/database'

type Client = Awaited<ReturnType<typeof createClient>>

export type DayHotel = Pick<
  Tables<'hotel_stays'>,
  | 'id' | 'name' | 'address'
  | 'check_in_date' | 'check_in_time'
  | 'check_out_date' | 'check_out_time'
  | 'wifi_network' | 'wifi_password'
  | 'lat' | 'lng'
>

const HOTEL_SELECT =
  'id, name, address, check_in_date, check_in_time, check_out_date, check_out_time, wifi_network, wifi_password, lat, lng'

// The one hotel to show in the day info block: the same link-first,
// date-matched-fallback shape lib/schedule/day-records.ts already uses for
// transport segments. A direct tour_date_id match wins; otherwise an
// unlinked stay (created before the link existed, or by the planner, which
// writes no link at all) whose check_in_date names this day. Never a
// date-only match ahead of the link: a stay that has just been moved to
// another day keeps its old check_in_date until that write commits, and the
// link is what keeps this block off the day the stay is leaving.
export async function resolveHotelForDay(
  supabase: Client,
  { tourId, tourDateId, date }: { tourId: string; tourDateId: string | null; date: string },
): Promise<DayHotel | null> {
  if (tourDateId) {
    const { data: linked } = await supabase
      .from('hotel_stays')
      .select(HOTEL_SELECT)
      .eq('tour_id', tourId)
      .eq('tour_date_id', tourDateId)
      .maybeSingle()

    if (linked) return linked
  }

  const { data: unlinked } = await supabase
    .from('hotel_stays')
    .select(HOTEL_SELECT)
    .eq('tour_id', tourId)
    .is('tour_date_id', null)
    .eq('check_in_date', date)
    .maybeSingle()

  return unlinked ?? null
}
