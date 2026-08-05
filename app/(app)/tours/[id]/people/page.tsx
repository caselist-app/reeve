import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PeopleView } from '@/components/people/people-view'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import type { Tables } from '@/lib/types/database'

export default async function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
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

  const [{ data: peopleRows }, { data: crewDetailRows }] = await Promise.all([
    supabase
      .from('people')
      .select('*, contacts(*)')
      .eq('tour_id', id),
    supabase
      .from('crew_detail')
      .select('*')
      .eq('tour_id', id),
  ])

  // Identity lives on the contact; order by contact name in JS.
  const people = (peopleRows ?? [])
    .filter((p): p is typeof p & { contacts: NonNullable<typeof p.contacts> } => p.contacts !== null)
    .sort((a, b) => a.contacts.name.localeCompare(b.contacts.name))

  // Index crew_detail by person_id for O(1) lookup in the client view.
  const crewDetails: Record<string, Tables<'crew_detail'>> = {}
  for (const cd of crewDetailRows ?? []) {
    crewDetails[cd.person_id] = cd
  }

  return (
    <PageLayout>
      <PageHeader eyebrow={tour.artists?.name ?? ''} title={tour.name} />
      <PeopleView
        tourId={id}
        people={people}
        crewDetails={crewDetails}
      />
    </PageLayout>
  )
}
