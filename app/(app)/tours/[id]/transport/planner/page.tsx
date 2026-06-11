import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { FreeformPlanner } from '@/components/transport/freeform-planner'

export default async function TransportPlannerPage({
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

  const { data: peopleRows } = await supabase
    .from('people')
    .select('id, contacts(name, home_city)')
    .eq('tour_id', id)

  // Identity (name, home_city) lives on the contact; flatten for the planner.
  const people = (peopleRows ?? [])
    .map((p) => {
      const c = p.contacts as { name: string; home_city: string | null } | null
      return { id: p.id, name: c?.name ?? '', home_city: c?.home_city ?? null }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href={`/tours/${id}/transport`}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Transport
      </Link>

      <div className="mb-8">
        <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
        <h1 className="text-2xl font-semibold">Plan travel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Search routes between any two cities, independent of shows.
        </p>
      </div>

      <FreeformPlanner
        tourId={id}
        people={people}
        timezone={tour.timezone}
      />
    </div>
  )
}
