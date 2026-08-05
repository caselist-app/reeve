'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { resolveTourDateId } from '@/lib/schedule/day-link'
import { z } from 'zod'

const tourDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  day_type: z.enum(['show', 'rehearsal', 'travel', 'press', 'day_off']),
  notes: z.string().nullable().optional(),
})

export type TourDateActionState = {
  error: string | null
  tourDateId?: string
}

export async function createTourDate(
  tourId: string,
  data: z.infer<typeof tourDateSchema>
): Promise<TourDateActionState> {
  const user = await requireUser()

  const parsed = tourDateSchema.safeParse(data)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  const { data: row, error } = await supabase
    .from('tour_dates')
    .upsert(
      { tour_id: tourId, ...parsed.data },
      { onConflict: 'tour_id,date', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (error) {
    return { error: error.message }
  }

  // A new day is a new row in the Dates sidebar, which is a layout in the
  // @secondaryPanel slot and therefore unreachable from the client: neither
  // router.push nor router.refresh re-resolves it. This was correct today only
  // by accident, because one of its callers happens to call router.refresh(),
  // which re-renders main and leaves the sidebar exactly as stale as before.
  // TEMPORARY, reverted in the next commit. Brief 41 step 6's red-first proof.

  return { error: null, tourDateId: row.id }
}

export async function updateTourDate(
  tourDateId: string,
  data: Partial<z.infer<typeof tourDateSchema>>
): Promise<TourDateActionState> {
  await requireUser()

  const supabase = await createClient()

  // Changing day_type away from 'show' or 'rehearsal' does not touch the
  // shows/rehearsals row that defines it (it was created by a separate
  // action). Silently allowing the change orphans that row: it stays in the
  // database, still pointing at this date, invisible from the day it was
  // created on. Block the change instead and tell the TM to delete the
  // attached entity first, so removal is always an explicit, visible action.
  if (data.day_type) {
    const { data: current } = await supabase
      .from('tour_dates')
      .select('day_type')
      .eq('id', tourDateId)
      .single()

    if (current && data.day_type !== current.day_type) {
      if (current.day_type === 'show') {
        const { data: show } = await supabase
          .from('shows')
          .select('id')
          .eq('tour_date_id', tourDateId)
          .maybeSingle()
        if (show) {
          return { error: 'This day still has a show attached. Delete the show first, then change the day type.' }
        }
      }
      if (current.day_type === 'rehearsal') {
        const { data: rehearsal } = await supabase
          .from('rehearsals')
          .select('id')
          .eq('tour_date_id', tourDateId)
          .maybeSingle()
        if (rehearsal) {
          return { error: 'This day still has a rehearsal attached. Delete the rehearsal first, then change the day type.' }
        }
      }
    }
  }

  const { data: row, error } = await supabase
    .from('tour_dates')
    .update(data)
    .eq('id', tourDateId)
    .select('tour_id')
    .single()

  if (error) {
    return { error: error.message }
  }

  // day_type drives the coloured chip on every row of the Dates sidebar, so a
  // day changed from travel to show keeps its old colour there until a hard
  // reload without this.
  revalidatePath(`/tours/${row.tour_id}/schedule`)

  return { error: null, tourDateId }
}

// Sets or clears the per-day title override shown in the day header. A blank
// title stores null, so the header falls back to the derived per-type default.
// RLS on tour_dates (owns_tour) scopes the write to the caller's tours.
export async function updateDayTitle(
  tourDateId: string,
  title: string | null
): Promise<TourDateActionState> {
  await requireUser()

  const supabase = await createClient()
  const value = title && title.trim() ? title.trim() : null

  const { data, error } = await supabase
    .from('tour_dates')
    .update({ custom_title: value })
    .eq('id', tourDateId)
    .select('tour_id')
    .single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath(`/tours/${data.tour_id}/schedule`)
  return { error: null, tourDateId }
}

// The day's notes, and the only writer of them.
//
// Brief 36 Part 4: there used to be three notes fields and a TM could see two
// of them at once. The day info panel wrote shows.notes on a show day and a
// __day_notes__ sentinel row in day_events otherwise; Add/Edit Day wrote
// tour_dates.notes; the Dates sidebar and the press-day header read
// tour_dates.notes. So a note typed into the panel never appeared in the
// sidebar, and a note typed into Add Day never appeared in the panel, with both
// inputs labelled Notes on the same screen. Notes belong to the day.
//
// Takes tourId and date rather than a tourDateId because the day info panel
// renders for any date in the URL, including one the tour does not have a day
// for yet. Typing a note on such a date adds the day, the same as every other
// record that resolves a date (see resolveTourDateId).
export async function updateDayNotes(
  tourId: string,
  date: string,
  notes: string,
): Promise<TourDateActionState> {
  const user = await requireUser()

  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) {
    return { error: 'Tour not found.' }
  }

  const day = await resolveTourDateId(supabase, tourId, date)
  if (!day.id) {
    return { error: day.error }
  }

  // A cleared textarea stores null, not an empty string: null is the TM having
  // no note for the day, which is what the sidebar and the press header check.
  const value = notes.trim() ? notes.trim() : null

  const { error } = await supabase
    .from('tour_dates')
    .update({ notes: value })
    .eq('id', day.id)

  if (error) {
    return { error: error.message }
  }

  // Notes render in three places on this route (the day info panel, the mobile
  // dock, and as the Dates sidebar subtitle or the press-day header subtitle).
  // The sidebar is a @secondaryPanel layout, so this is the only thing that can
  // refresh it.
  revalidatePath(`/tours/${tourId}/schedule`)
  return { error: null, tourDateId: day.id }
}

export async function deleteTourDate(tourDateId: string): Promise<TourDateActionState> {
  await requireUser()

  const supabase = await createClient()

  // Read before the delete, because the row is the only place the tour id is
  // and it will not exist afterwards. RLS on tour_dates enforces
  // owns_tour(tour_id), so this is null when the caller does not own the day.
  const { data: existing } = await supabase
    .from('tour_dates')
    .select('tour_id')
    .eq('id', tourDateId)
    .single()

  if (!existing) return { error: 'Day not found.' }

  const { error } = await supabase
    .from('tour_dates')
    .delete()
    .eq('id', tourDateId)

  if (error) {
    return { error: error.message }
  }

  // Same layout trap as createTourDate, and more visible: the caller pushes to
  // another date, and the deleted day stayed in the sidebar, clickable, until a
  // hard reload.
  revalidatePath(`/tours/${existing.tour_id}/schedule`)

  return { error: null }
}
