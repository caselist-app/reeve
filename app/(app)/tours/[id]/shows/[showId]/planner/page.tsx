import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PlannerWorkspace } from '@/components/planner/planner-workspace'

export default async function PlannerPage({
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
      .select(
        'id, tour_id, venue_name, date, load_in_at, hub_resolved_at, transport_hub_iata, transport_hub_rail, hub_ground_minutes'
      )
      .eq('id', showId)
      .eq('tour_id', id)
      .single(),
    supabase
      .from('people')
      .select('id, name, role, home_city')
      .eq('tour_id', id)
      .order('name'),
  ])

  if (!show) redirect(`/tours/${id}/shows`)

  const formattedDate = new Date(`${show.date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/tours/${id}/shows/${showId}`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        {show.venue_name}
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
        <h1 className="text-2xl font-semibold">Travel planner</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {show.venue_name} &nbsp;·&nbsp; {formattedDate}
        </p>
      </div>

      {!people || people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add people to this tour before planning travel.
        </p>
      ) : (
        <PlannerWorkspace
          show={show}
          people={people}
          tourId={id}
          timezone={tour.timezone}
        />
      )}
    </div>
  )
}
