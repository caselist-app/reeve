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

// `created` says the date was not a day of the tour until this call added it.
// Callers pass it back to the TM ("added to the tour"), because a save that
// silently extends the tour's day list is the kind of correct-but-invisible
// change Brief 36's follow-up exists to announce. It is only ever true on the
// success branch, so the failure branch pins it to false rather than leaving it
// optional and letting a caller read it off an errored result.
type Resolved =
  | { id: string; created: boolean; error: null }
  | { id: null; created: false; error: string }

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

      if (error) return { id: null, created: false, error: error.message }
    }
    return { id: existing.id, created: false, error: null }
  }

  const { data: created, error } = await supabase
    .from('tour_dates')
    .insert({
      tour_id: tourId,
      date,
      // No dayType means the table default, 'day_off'. A caller that cannot say
      // what kind of day a new date is (a hotel check-in) leaves it there rather
      // than guessing and putting a chip in the sidebar the TM never chose.
      // Transport passes 'travel', because a day that exists only because a
      // departure landed on it is a travel day.
      ...(options.dayType ? { day_type: options.dayType } : {}),
    })
    .select('id')
    .single()

  if (created) return { id: created.id, created: true, error: null }

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

    // created: true, even though the losing save is not the one that inserted
    // the row. The claim being reported to the TM is that the day was not on the
    // tour when they hit save and is now, which is true either way, and which of
    // two concurrent saves won the insert is not something they should be told
    // about.
    if (raced) return { id: raced.id, created: true, error: null }
  }

  return {
    id: null,
    created: false,
    error: error?.message ?? 'Could not resolve the day for that date.',
  }
}
