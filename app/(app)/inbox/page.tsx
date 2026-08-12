import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { fetchInbox } from '@/lib/inbox/query'
import { groupByArtist } from '@/lib/inbox/group'
import { PageLayout } from '@/components/layout/page-layout'
import { InboxView } from '@/components/inbox/inbox-view'

export default async function InboxPage() {
  const user = await requireUser()
  const supabase = await createClient()

  const { items, error } = await fetchInbox(supabase, user.id)
  const groups = groupByArtist(items)

  return (
    <PageLayout>
      <InboxView groups={groups} error={error} />
    </PageLayout>
  )
}
