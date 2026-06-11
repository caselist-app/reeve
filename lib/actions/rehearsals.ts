'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const rehearsalSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  location_name: z.string().min(1, 'Location name is required'),
  address: z.string().nullable().optional(),
  google_maps_url: z.string().url('Invalid URL').nullable().optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export type RehearsalActionState = {
  error: string | null
  rehearsalId?: string
}

// Creates the tour_dates row (upsert) and the rehearsals row together.
// Returns the rehearsalId so the caller can redirect to the detail page.
export async function createRehearsal(
  tourId: string,
  data: z.infer<typeof rehearsalSchema>
): Promise<RehearsalActionState> {
  const user = await requireUser()

  const parsed = rehearsalSchema.safeParse(data)
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

  if (!tour) return { error: 'Tour not found.' }

  // Upsert the tour_dates row. If a date already exists, update day_type to rehearsal.
  const { data: tourDate, error: tdError } = await supabase
    .from('tour_dates')
    .upsert(
      { tour_id: tourId, date: parsed.data.date, day_type: 'rehearsal' },
      { onConflict: 'tour_id,date', ignoreDuplicates: false }
    )
    .select('id')
    .single()

  if (tdError) return { error: tdError.message }

  const { date: _date, ...rest } = parsed.data

  const { data: rehearsal, error: rError } = await supabase
    .from('rehearsals')
    .insert({
      tour_id: tourId,
      tour_date_id: tourDate.id,
      location_name: rest.location_name,
      address: rest.address ?? null,
      google_maps_url: rest.google_maps_url ?? null,
      start_at: rest.start_at ?? null,
      end_at: rest.end_at ?? null,
      notes: rest.notes ?? null,
    })
    .select('id')
    .single()

  if (rError) return { error: rError.message }

  return { error: null, rehearsalId: rehearsal.id }
}

export async function updateRehearsal(
  rehearsalId: string,
  data: Partial<Omit<z.infer<typeof rehearsalSchema>, 'date'>>
): Promise<RehearsalActionState> {
  await requireUser()

  const supabase = await createClient()

  const { error } = await supabase
    .from('rehearsals')
    .update({
      location_name: data.location_name,
      address: data.address ?? null,
      google_maps_url: data.google_maps_url ?? null,
      start_at: data.start_at ?? null,
      end_at: data.end_at ?? null,
      notes: data.notes ?? null,
    })
    .eq('id', rehearsalId)

  if (error) return { error: error.message }

  return { error: null, rehearsalId }
}

export async function deleteRehearsal(rehearsalId: string): Promise<RehearsalActionState> {
  await requireUser()

  const supabase = await createClient()

  const { error } = await supabase
    .from('rehearsals')
    .delete()
    .eq('id', rehearsalId)

  if (error) return { error: error.message }

  return { error: null }
}
