'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { tourSchema } from '@/lib/validators/tour'

export type TourActionState = { error: string | null }

// TODO: Brief 02 - replace with the actual trial gate check once billing is wired.
async function canCreateTour(_accountId: string): Promise<boolean> {
  return true
}

function parseTourFormData(formData: FormData) {
  return tourSchema.safeParse({
    name: formData.get('name'),
    artist_act: formData.get('artist_act'),
    start_date: formData.get('start_date') || undefined,
    end_date: formData.get('end_date') || undefined,
    territory: formData.get('territory') || undefined,
    base_currency: formData.get('base_currency') || 'GBP',
    artist_slug: formData.get('artist_slug') || undefined,
    timezone: formData.get('timezone') || undefined,
  })
}

export async function createTourAction(
  _prev: TourActionState,
  formData: FormData
): Promise<TourActionState> {
  const user = await requireUser()

  const parsed = parseTourFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const allowed = await canCreateTour(user.id)
  if (!allowed) {
    return { error: 'You have reached the tour limit on your current plan.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tours')
    .insert({ account_id: user.id, ...parsed.data })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'This slug is already in use. Try a different artist slug.' }
    }
    return { error: error.message }
  }

  redirect(`/tours/${data.id}/people`)
}

// tourId is pre-bound via .bind(null, tourId) in the settings page component.
export async function updateTourAction(
  tourId: string,
  _prev: TourActionState,
  formData: FormData
): Promise<TourActionState> {
  const user = await requireUser()

  const parsed = parseTourFormData(formData)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('tours')
    .update(parsed.data)
    .eq('id', tourId)
    .eq('account_id', user.id)

  if (error) {
    if (error.code === '23505') {
      return { error: 'This slug is already in use. Try a different artist slug.' }
    }
    return { error: error.message }
  }

  return { error: null }
}

// Called directly from a client component onClick (not via useActionState).
// Redirects to /app on success; returns an error string on failure.
export async function archiveTourAction(tourId: string): Promise<TourActionState> {
  const user = await requireUser()
  const supabase = await createClient()

  const { error } = await supabase
    .from('tours')
    .update({ status: 'archived' })
    .eq('id', tourId)
    .eq('account_id', user.id)

  if (error) {
    return { error: error.message }
  }

  redirect('/app')
}
