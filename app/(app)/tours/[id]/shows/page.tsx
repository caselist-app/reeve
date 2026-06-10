import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { ShowsView } from '@/components/shows/shows-view'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import type { Tables } from '@/lib/types/database'

export default async function ShowsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_act, timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/app')

  const [{ data: shows }, { data: advances }] = await Promise.all([
    supabase.from('shows').select('*').eq('tour_id', id).order('date', { ascending: true }),
    supabase.from('show_advance').select('*').eq('tour_id', id),
  ])

  // Index advances by show_id for O(1) lookup in the view.
  const advanceByShow: Record<string, Tables<'show_advance'>> = {}
  for (const a of advances ?? []) {
    advanceByShow[a.show_id] = a
  }

  const showsWithAdvance = (shows ?? []).map((show) => ({
    ...show,
    show_advance: advanceByShow[show.id] ?? null,
  }))

  return (
    <PageLayout>
      <PageHeader eyebrow={tour.artist_act} title={tour.name} />
      <ShowsView tourId={id} shows={showsWithAdvance} timezone={tour.timezone} />
    </PageLayout>
  )
}
