import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Brief 36 Part 1. tour_dates is the spine: tour_date_id is the source of truth
// for which day a record belongs to, and the record's own date column derives
// from it. Brief 19 retrofitted that link onto shows, hotel_stays and
// transport_segments, updated every create path to write both columns, and left
// every edit path writing the date alone. The link then pointed at the day the
// record used to be on, and the schedule (which queries by the link) and the
// crew-facing comms (which read the date) disagreed about where it was.
//
// This is the one place that turns a date into a day. Every action that can
// change a record's date calls it and writes both columns together, so the two
// cannot come apart in the first place.
//
// Matt's decision, 2026-08-04: a date with no tour_dates row gets one created
// rather than the edit being rejected. It matches what the add-show path
// already does through create_show_with_dependents, and it means the record
// lands somewhere the TM can see it in the Dates sidebar. A record on a day
// that is not in the tour's day list is the invisibility this brief exists to
// remove.

type Client = SupabaseClient<Database>

export type DayType = 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'

type Resolved = { id: string; error: null } | { id: null; error: string }

export async function resolveTourDateId(
  supabase: Client,
  tourId: string,
  date: string,
  options: { dayType?: DayType } = {},
): Promise<Resolved> {
  const { data: existing } = await supabase
    .from('tour_dates')
    .select('id, day_type')
    .eq('tour_id', tourId)
    .eq('date', date)
    .maybeSingle()

  if (existing) {
    // Only 'show' promotes an existing day, mirroring
    // create_show_with_dependents' `on conflict do update set day_type = 'show'`.
    // A hotel or a flight moving onto a show day must not relabel it, which is
    // why this is opt-in per caller rather than a blanket overwrite.
    if (options.dayType === 'show' && existing.day_type !== 'show') {
      const { error } = await supabase
        .from('tour_dates')
        .update({ day_type: 'show' })
        .eq('id', existing.id)

      if (error) return { id: null, error: error.message }
    }
    return { id: existing.id, error: null }
  }

  const { data: created, error } = await supabase
    .from('tour_dates')
    .insert({
      tour_id: tourId,
      date,
      // No dayType means the table default, 'day_off'. A hotel or a flight does
      // not tell us what kind of day this is, and guessing 'travel' would put a
      // chip in the sidebar the TM never chose.
      ...(options.dayType ? { day_type: options.dayType } : {}),
    })
    .select('id')
    .single()

  if (created) return { id: created.id, error: null }

  // tour_dates has unique(tour_id, date). Two saves landing on the same new day
  // at once means one of them loses the insert, and the row it wanted now
  // exists, so re-read rather than failing the TM's save.
  if (error?.code === '23505') {
    const { data: raced } = await supabase
      .from('tour_dates')
      .select('id')
      .eq('tour_id', tourId)
      .eq('date', date)
      .maybeSingle()

    if (raced) return { id: raced.id, error: null }
  }

  return { id: null, error: error?.message ?? 'Could not resolve the day for that date.' }
}
