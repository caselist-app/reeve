import { requireUser } from '@/lib/auth/helpers'
import { NewArtistForm } from '@/components/artists/new-artist-form'

export default async function NewArtistPage() {
  await requireUser()
  return (
    <div className="mx-auto max-w-lg px-4 py-12">
      <h1 className="mb-8 text-2xl font-semibold">New artist</h1>
      <NewArtistForm />
    </div>
  )
}
