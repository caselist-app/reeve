'use server'

import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'

export interface PaletteData {
  shows: { id: string; venue_name: string; date: string }[]
  people: { id: string; name: string; person_type: string }[]
}

export async function getPaletteData(tourId: string): Promise<PaletteData> {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify the caller owns the tour before returning any data.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('account_id', user.id)
    .single()

  if (!tour) return { shows: [], people: [] }

  const [{ data: shows }, { data: people }] = await Promise.all([
    supabase
      .from('shows')
      .select('id, venue_name, date')
      .eq('tour_id', tourId)
      .order('date', { ascending: true }),
    supabase
      .from('people')
      .select('id, name, person_type')
      .eq('tour_id', tourId)
      .order('name'),
  ])

  return { shows: shows ?? [], people: people ?? [] }
}
