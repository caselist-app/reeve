import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { DeleteArtistDialog } from '@/components/artists/delete-artist-dialog'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ArtistSettingsPage({ params }: Props) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: artist } = await supabase
    .from('artists')
    .select('id, name, slug')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!artist) notFound()

  const { count } = await supabase
    .from('tours')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', id)

  return (
    <div className="mx-auto max-w-lg px-4 py-12 space-y-10">
      <div>
        <h1 className="text-2xl font-semibold">{artist.name}</h1>
        {artist.slug && (
          <p className="mt-1 text-sm text-muted-foreground">
            advancing@{artist.slug}.yourreeve.com
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-destructive/30 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deleting this artist removes all tours, shows, people, transport, hotels, and
            documents permanently. There is no way to recover this data.
          </p>
        </div>
        <DeleteArtistDialog
          artistId={artist.id}
          artistName={artist.name}
          tourCount={count ?? 0}
        />
      </div>
    </div>
  )
}
