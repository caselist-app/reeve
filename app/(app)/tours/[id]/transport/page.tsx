import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { TransportView } from '@/components/transport/transport-view'
import type { SegmentWithContext } from '@/components/transport/segment-row'
import type { Json } from '@/lib/types/database'

export default async function TransportPage({
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

  if (!tour) redirect('/')

  const timezone = tour.timezone ?? 'UTC'

  const [{ data: rawSegments }, { data: shows }] = await Promise.all([
    supabase
      .from('transport_segments')
      .select('*, transport_assignments(id)')
      .eq('tour_id', id)
      .order('depart_at', { ascending: true, nullsFirst: false }),
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

  // Extract show_id from details_json for grouping.
  function extractShowId(details: Json): string | null {
    if (!details || typeof details !== 'object' || Array.isArray(details)) return null
    const d = details as Record<string, unknown>
    return typeof d.show_id === 'string' ? d.show_id : null
  }

  const segments: SegmentWithContext[] = (rawSegments ?? []).map((seg) => {
    const assignments = seg.transport_assignments as { id: string }[] | null
    return {
      ...seg,
      assigned_count: assignments?.length ?? 0,
      show_id: extractShowId(seg.details_json),
    }
  })

  // Summary counts for the page description.
  const total = segments.length
  const booked = segments.filter(
    (s) => s.status === 'booked' || s.status === 'ticketed'
  ).length
  const planned = segments.filter((s) => s.status === 'planned').length

  const description =
    total === 0
      ? undefined
      : `${total} ${total === 1 ? 'segment' : 'segments'} — ${booked} booked, ${planned} planned`

  return (
    <PageLayout maxWidth="max-w-7xl">
      <PageHeader
        eyebrow={tour.artist_act}
        title="Transport"
        description={description}
        actions={
          <Link
            href={`/tours/${id}/transport/planner`}
            className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Plan travel
          </Link>
        }
      />
      <TransportView
        tourId={id}
        timezone={timezone}
        segments={segments}
        shows={showList}
      />
    </PageLayout>
  )
}
