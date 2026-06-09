import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PeopleView } from '@/components/people/people-view'
import type { Tables } from '@/lib/types/database'

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, artist_act')
    .eq('id', id)
    .eq('account_id', user.id)
    .single()

  if (!tour) redirect('/app')

  const [{ data: people }, { data: crewDetailRows }] = await Promise.all([
    supabase
      .from('people')
      .select('*')
      .eq('tour_id', id)
      .order('name'),
    supabase
      .from('crew_detail')
      .select('*')
      .eq('tour_id', id),
  ])

  // Index crew_detail by person_id for O(1) lookup in the client view.
  const crewDetails: Record<string, Tables<'crew_detail'>> = {}
  for (const cd of crewDetailRows ?? []) {
    crewDetails[cd.person_id] = cd
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{tour.artist_act}</p>
          <h1 className="text-2xl font-semibold">{tour.name}</h1>
        </div>
      </div>

      <PeopleView
        tourId={id}
        people={people ?? []}
        crewDetails={crewDetails}
      />
    </div>
  )
}
