'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { dayEventSchema, dayEventUpdateSchema } from '@/lib/validators/day-event'
import type { z } from 'zod'

export type DayEventActionState = { error: string | null; eventId?: string }

export async function createDayEvent(
  data: z.infer<typeof dayEventSchema>,
): Promise<DayEventActionState> {
  await requireUser()

  const parsed = dayEventSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // RLS enforces owns_tour(tour_id); if ownership fails, insert returns null.
  const { data: row, error } = await supabase
    .from('day_events')
    .insert(parsed.data)
    .select('id')
    .single()

  if (error || !row) return { error: error?.message ?? 'Failed to create event.' }

  revalidatePath(`/tours/${parsed.data.tour_id}/schedule`)
  return { error: null, eventId: row.id }
}

export async function updateDayEvent(
  eventId: string,
  data: z.infer<typeof dayEventUpdateSchema>,
): Promise<DayEventActionState> {
  await requireUser()

  const parsed = dayEventUpdateSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // Fetch tour_id for path revalidation; RLS restricts to owned events.
  const { data: existing } = await supabase
    .from('day_events')
    .select('tour_id')
    .eq('id', eventId)
    .single()

  if (!existing) return { error: 'Event not found.' }

  const { error } = await supabase
    .from('day_events')
    .update(parsed.data)
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${existing.tour_id}/schedule`)
  return { error: null, eventId }
}

export async function deleteDayEvent(
  eventId: string,
): Promise<DayEventActionState> {
  await requireUser()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('day_events')
    .select('tour_id')
    .eq('id', eventId)
    .single()

  if (!existing) return { error: 'Event not found.' }

  const { error } = await supabase
    .from('day_events')
    .delete()
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${existing.tour_id}/schedule`)
  return { error: null }
}

// Upserts the __day_notes__ sentinel row for non-show days.
// Used by the day info panel notes textarea.
export async function upsertDayNotes(
  tourId: string,
  date: string,
  notes: string,
): Promise<DayEventActionState> {
  await requireUser()

  const supabase = await createClient()

  // Find existing notes row for this tour+date.
  const { data: existing } = await supabase
    .from('day_events')
    .select('id')
    .eq('tour_id', tourId)
    .eq('date', date)
    .eq('title', '__day_notes__')
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('day_events')
      .update({ notes })
      .eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase
      .from('day_events')
      .insert({ tour_id: tourId, date, title: '__day_notes__', notes, starts_at: null })
    if (error) return { error: error.message }
  }

  revalidatePath(`/tours/${tourId}/schedule`)
  return { error: null }
}
