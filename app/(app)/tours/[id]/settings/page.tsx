import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { TourSettingsForm } from '@/components/tours/settings-form'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'

export default async function TourSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tourRaw } = await supabase
    .from('tours')
    .select('*, artists(name)')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tourRaw) {
    redirect('/')
  }

  const artistName = tourRaw.artists?.name ?? ''
  // Pass only the base tour fields (no joined artists) to the form which expects Tables<'tours'>.
  const { artists: _artists, ...tour } = tourRaw

  return (
    <PageLayout maxWidth="max-w-lg">
      <PageHeader eyebrow={artistName} title="Settings" />
      <TourSettingsForm tour={tour} />
    </PageLayout>
  )
}
