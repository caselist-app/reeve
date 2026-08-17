'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { artistSchema } from '@/lib/validators/artist'
import { provisionTourEmailDomain, deprovisionTourEmailDomain } from '@/lib/comms/email'

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

  // Both routes read the artist list server-side and are reachable via
  // client-side navigation after this action, so they need revalidating or
  // the Router Cache serves the pre-create snapshot (REE-261).
  revalidatePath('/tours/new')
  revalidatePath('/roster')

  return { error: null, artistId: data?.id }
}

// Used only by the standalone /artists/new form. new-tour-form.tsx's inline
// "+ New artist" flow calls createArtistAction directly and must not redirect,
// since it goes on to create the tour in the same submission.
//
// Redirecting server-side, rather than having the client call router.push
// after the action resolves, is the pattern createTourAction already uses
// (lib/actions/tours.ts): the navigation is part of the action's own response
// instead of a separate client-triggered fetch racing the revalidatePath
// above. A client-side push here was intermittently leaving /tours/new stuck
// on its loading.tsx fallback in e2e (REE-261).
export async function createArtistAndGoToNewTourAction(
  prev: ArtistActionState,
  formData: FormData
): Promise<ArtistActionState> {
  // Server actions are publicly POSTable, so this needs its own requireUser()
  // even though createArtistAction below repeats the check.
  await requireUser()

  const result = await createArtistAction(prev, formData)
  if (result.error) return result
  redirect('/tours/new')
}

export async function deleteArtistAction(artistId: string): Promise<void> {
  const user = await requireUser()
  const supabase = await createClient()

  // Verify ownership before touching anything. slug is fetched here because
  // it is needed to deprovision the email domain after the row is gone.
  const { data: artist, error: fetchError } = await supabase
    .from('artists')
    .select('id, slug')
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

  // Clean up the Resend domain and Cloudflare DNS records now that the
  // artist is gone. Non-blocking: a failed cleanup leaves a stray domain
  // and a handful of DNS records, not a broken deletion.
  if (artist.slug) {
    try {
      await deprovisionTourEmailDomain(artist.slug)
    } catch (err) {
      console.error('[deleteArtist] Failed to deprovision email domain:', err)
    }
  }

  redirect('/')
}
