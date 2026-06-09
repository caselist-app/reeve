import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { HotelWorkspace } from '@/components/planner/hotel-workspace'

export default async function HotelsPage({
  params,
}: {
  params: Promise<{ id: string; showId: string }>
}) {
  const { id, showId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_act, timezone')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/')

  const [{ data: show }, { data: people }] = await Promise.all([
    supabase
      .from('shows')
      .select('id, tour_id, venue_name, date, venue_lat, venue_lng')
      .eq('id', showId)
      .eq('tour_id', id)
      .single(),
    supabase
      .from('people')
      .select('id, name, person_type')
      .eq('tour_id', id)
      .order('name'),
  ])

  if (!show) redirect(`/tours/${id}/shows`)

  // Pre-fill arrive_at / depart_at from any planned transport segment for this show.
  // This is best-effort: if no segment exists the TM fills in manually.
  const { data: segment } = await supabase
    .from('transport_segments')
    .select('arrive_at, depart_at')
    .eq('tour_id', id)
    .not('arrive_at', 'is', null)
    .order('depart_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const formattedDate = new Date(`${show.date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/tours/${id}/shows/${showId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {show.venue_name}
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
        <h1 className="text-2xl font-semibold">Hotel search</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {show.venue_name} &nbsp;·&nbsp; {formattedDate}
        </p>
      </div>

      <HotelWorkspace
        show={show}
        tourId={id}
        people={people ?? []}
        defaultArriveAt={segment?.arrive_at ?? null}
        defaultDepartAt={segment?.depart_at ?? null}
      />
    </div>
  )
}
