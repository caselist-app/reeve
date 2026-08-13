import { requireUser } from '@/lib/auth/helpers'
import { NewArtistForm } from '@/components/artists/new-artist-form'
import { PageLayout } from '@/components/layout/page-layout'

export default async function NewArtistPage() {
  await requireUser()
  return (
    <PageLayout maxWidth="max-w-lg">
      <h1 className="mb-8 text-2xl font-semibold">New artist</h1>
      <NewArtistForm />
    </PageLayout>
  )
}
