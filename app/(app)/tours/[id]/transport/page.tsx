import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { TransportView } from '@/components/transport/transport-view'
import type { SegmentWithContext } from '@/components/transport/segment-row'

export default async function TransportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const { id } = await params
  const { date: focusDate } = await searchParams
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artists(name), timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const timezone = tour.timezone ?? 'UTC'

  const { data: rawSegments } = await supabase
    .from('transport_segments')
    .select('*, transport_assignments(id)')
    .eq('tour_id', id)
    .order('depart_at', { ascending: true, nullsFirst: false })

  const segments: SegmentWithContext[] = (rawSegments ?? []).map((seg) => {
    const assignments = seg.transport_assignments as { id: string }[] | null
    return {
      ...seg,
      assigned_count: assignments?.length ?? 0,
      show_id: null,
    }
  })

  const total = segments.length
  const booked = segments.filter((s) => s.status === 'booked' || s.status === 'ticketed').length
  const planned = segments.filter((s) => s.status === 'planned').length

  const description =
    total === 0
      ? undefined
      : `${total} ${total === 1 ? 'segment' : 'segments'} — ${booked} booked, ${planned} planned`

  return (
    <PageLayout maxWidth="max-w-7xl">
      <PageHeader
        eyebrow={(tour.artists as unknown as { name: string } | null)?.name ?? ''}
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
        focusDate={focusDate ?? null}
      />
    </PageLayout>
  )
}
