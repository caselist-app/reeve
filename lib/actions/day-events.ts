'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { dayEventSchema, dayEventUpdateSchema } from '@/lib/validators/day-event'
import type { z } from 'zod'

export type DayEventActionState = { error: string | null; eventId?: string }

// RLS scopes rows by tour but does not check that two ids in one payload belong
// to the same tour. Every action here taking both a tour and a show verifies it.
async function showIsOnTour(
  supabase: Awaited<ReturnType<typeof createClient>>,
  showId: string,
  tourId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('shows')
    .select('id')
    .eq('id', showId)
    .eq('tour_id', tourId)
    .maybeSingle()

  return Boolean(data)
}

export async function createDayEvent(
  data: z.infer<typeof dayEventSchema>,
): Promise<DayEventActionState> {
  await requireUser()

  const parsed = dayEventSchema.safeParse(data)
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const supabase = await createClient()

  // RLS enforces owns_tour(tour_id); if ownership fails, insert returns null.
  // It does not check show_id, which arrives in the same payload: a show from
  // another tour would bind cleanly and corrupt day-view grouping.
  if (parsed.data.show_id && !(await showIsOnTour(supabase, parsed.data.show_id, parsed.data.tour_id))) {
    return { error: 'Show not found on this tour.' }
  }

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

  // dayEventUpdateSchema drops tour_id but keeps show_id, so without this an
  // update could repoint an event at another tour's show even though the event
  // itself is one the caller owns.
  if (parsed.data.show_id && !(await showIsOnTour(supabase, parsed.data.show_id, existing.tour_id))) {
    return { error: 'Show not found on this tour.' }
  }

  const { error } = await supabase
    .from('day_events')
    .update(parsed.data)
    .eq('id', eventId)

  if (error) return { error: error.message }

  revalidatePath(`/tours/${existing.tour_id}/schedule`)
  return { error: null, eventId }
}

// The __day_notes__ sentinel row that used to live here is gone. Day notes are
// tour_dates.notes, written by updateDayNotes in lib/actions/tour-dates.ts.
// See Brief 36 Part 4.
