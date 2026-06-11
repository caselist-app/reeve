'use server'

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
