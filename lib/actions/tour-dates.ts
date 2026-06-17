'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
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

  return { error: null, tourDateId: row.id }
}

export async function updateTourDate(
  tourDateId: string,
  data: Partial<z.infer<typeof tourDateSchema>>
): Promise<TourDateActionState> {
  await requireUser()

  const supabase = await createClient()

  const { error } = await supabase
    .from('tour_dates')
    .update(data)
    .eq('id', tourDateId)

  if (error) {
    return { error: error.message }
  }

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

export async function deleteTourDate(tourDateId: string): Promise<TourDateActionState> {
  await requireUser()

  const supabase = await createClient()

  // RLS on tour_dates enforces owns_tour(tour_id).
  const { error } = await supabase
    .from('tour_dates')
    .delete()
    .eq('id', tourDateId)

  if (error) {
    return { error: error.message }
  }

  return { error: null }
}
