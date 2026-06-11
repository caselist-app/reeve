import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { PageLayout } from '@/components/layout/page-layout'
import { RosterView } from '@/components/roster/roster-view'

export default async function RosterPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const [{ data: contacts }, { data: memberships }] = await Promise.all([
    supabase.from('contacts').select('*').eq('account_id', user.id).order('name'),
    // people RLS scopes to the caller's tours, so this is every membership the
    // caller owns. Used to count how many tours each contact is on.
    supabase.from('people').select('contact_id, tour_id'),
  ])

  const tourSets: Record<string, Set<string>> = {}
  for (const m of memberships ?? []) {
    if (!m.contact_id) continue
    ;(tourSets[m.contact_id] ??= new Set()).add(m.tour_id)
  }

  const rows = (contacts ?? []).map((c) => ({
    ...c,
    tourCount: tourSets[c.id]?.size ?? 0,
  }))

  return (
    <PageLayout>
      <RosterView contacts={rows} />
    </PageLayout>
  )
}
