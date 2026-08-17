import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { fetchInbox, fetchResolvedInbox } from '@/lib/inbox/query'
import { groupByArtist } from '@/lib/inbox/group'
import { PageLayout } from '@/components/layout/page-layout'
import { InboxView } from '@/components/inbox/inbox-view'

// The archive toggle (REE-232): ?view=archive reads resolved items instead of
// open ones, through fetchResolvedInbox (REE-231). Read-only: the archive view
// never marks anything read, so there is nothing here for a producer to fight
// over with the badge count, which counts open items and never sees this route.
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const { view } = await searchParams
  const archive = view === 'archive'

  const user = await requireUser()
  const supabase = await createClient()

  const { items, error } = archive
    ? await fetchResolvedInbox(supabase, user.id)
    : await fetchInbox(supabase, user.id)
  const groups = groupByArtist(items)

  return (
    <PageLayout>
      <InboxView groups={groups} error={error} archive={archive} />
    </PageLayout>
  )
}
