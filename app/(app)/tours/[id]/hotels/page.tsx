import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { HotelsView } from '@/components/hotels/hotels-view'
import type { StayWithContext } from '@/components/hotels/stay-row'
import type { Json } from '@/lib/types/database'

export default async function HotelsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name)')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const [{ data: rawStays }, { data: shows }] = await Promise.all([
    supabase
      .from('hotel_stays')
      .select('*, room_assignments(id)')
      .eq('tour_id', id)
      .order('check_in_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('shows')
      .select('id, venue_name, date')
      .eq('tour_id', id)
      .order('date', { ascending: true }),
  ])

  const showList = (shows ?? []).map((s) => ({
    show_id: s.id,
    venue_name: s.venue_name ?? 'Unnamed venue',
    show_date: s.date,
  }))

  // Extract show_id from room_types_json, where it is stored alongside the raw
  // provider payload when a stay is recorded via the hotel planner.
  function extractShowId(json: Json): string | null {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null
    const j = json as Record<string, unknown>
    return typeof j.show_id === 'string' ? j.show_id : null
  }

  const stays: StayWithContext[] = (rawStays ?? []).map((stay) => {
    const assignments = stay.room_assignments as { id: string }[] | null
    return {
      ...stay,
      room_count: assignments?.length ?? 0,
      show_id: extractShowId(stay.room_types_json),
    }
  })

  // Summary counts for the page description.
  const total = stays.length
  const confirmed = stays.filter((s) => !!s.confirmation_number?.trim()).length
  const toBook = total - confirmed

  const description =
    total === 0
      ? undefined
      : `${total} ${total === 1 ? 'night' : 'nights'} — ${confirmed} confirmed, ${toBook} to book`

  return (
    <PageLayout maxWidth="max-w-7xl">
      <PageHeader
        eyebrow={tour.artists?.name ?? ''}
        title="Hotels"
        description={description}
      />
      <HotelsView
        tourId={id}
        stays={stays}
        shows={showList}
      />
    </PageLayout>
  )
}
