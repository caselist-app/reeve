'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { artistSchema } from '@/lib/validators/artist'
import { provisionTourEmailDomain } from '@/lib/comms/email'

export type ArtistActionState = { error: string | null; artistId?: string }

export async function createArtistAction(
  _prev: ArtistActionState,
  formData: FormData
): Promise<ArtistActionState> {
  const user = await requireUser()

  const parsed = artistSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug') || undefined,
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('artists')
    .insert({ account_id: user.id, ...parsed.data })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { error: 'This slug is already in use. Try a different slug.' }
    }
    return { error: error.message }
  }

  // Provision the Resend sending domain once per artist.
  if (parsed.data.slug) {
    try {
      await provisionTourEmailDomain(parsed.data.slug)
    } catch (err) {
      console.error('[createArtist] Failed to provision email domain:', err)
    }
  }

  return { error: null, artistId: data?.id }
}

export async function deleteArtistAction(artistId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify ownership before touching anything.
  const { data: artist, error: fetchError } = await supabase
    .from('artists')
    .select('id')
    .eq('id', artistId)
    .eq('account_id', user.id)
    .single()

  if (fetchError || !artist) {
    throw new Error('Artist not found or access denied')
  }

  // Delete all tours for this artist. Every tour child table (shows, people,
  // transport, hotels, documents, etc.) has ON DELETE CASCADE, so one delete
  // clears everything.
  const { error: toursError } = await supabase
    .from('tours')
    .delete()
    .eq('artist_id', artistId)

  if (toursError) {
    throw new Error(toursError.message)
  }

  // Now safe to delete the artist (tours FK was RESTRICT, tours are gone).
  const { error: artistError } = await supabase
    .from('artists')
    .delete()
    .eq('id', artistId)
    .eq('account_id', user.id)

  if (artistError) {
    throw new Error(artistError.message)
  }

  redirect('/')
}
