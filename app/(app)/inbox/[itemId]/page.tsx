import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { requireUser } from '@/lib/auth/helpers'
import { createClient } from '@/lib/supabase/server'
import { fetchInboxItem } from '@/lib/inbox/item'
import { relativeLabel } from '@/lib/inbox/format'
import { PageLayout } from '@/components/layout/page-layout'
import { PageHeader } from '@/components/layout/page-header'
import { GuestRequestItem } from '@/components/inbox/guest-request-item'
import { ExtractionItem } from '@/components/inbox/extraction-item'
import { ClearFromInboxButton } from '@/components/inbox/clear-from-inbox-button'

// The item detail route (brief 53, REE-152, REE-154): reads one
// attention_items row, scoped to the account the same way the list scopes it
// (fetchInbox), then branches on kind. guest_request and email_extraction
// each have a dedicated view; every other kind falls back to a plain
// rendering of title and detail rather than a 404, so a TM can still click a
// backfilled row of a kind that has not got its own view yet.
export default async function InboxItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>
}) {
  const { itemId } = await params
  const user = await requireUser()
  const supabase = await createClient()

  const { item, subject, danglingPointer, error } = await fetchInboxItem(supabase, user.id, itemId)

  // Not found and not an error: either the id is stale or it belongs to
  // another account, both of which RLS and the account scope in fetchInboxItem
  // already collapse into "no row". Same shape as the roster detail route.
  if (!item && !error) redirect('/inbox')

  return (
    <PageLayout maxWidth="max-w-2xl">
      <Link
        href="/inbox"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Inbox
      </Link>

      {error || !item ? (
        <p className="text-sm text-destructive">Could not load this item. Try refreshing the page.</p>
      ) : (
        <>
          <PageHeader
            eyebrow={item.artist_name}
            title={item.title}
            description={`${item.tour_name} · ${relativeLabel(item.created_at, item.timezone)}`}
          />

          {danglingPointer ? (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">
                This is no longer here. The guest list request it pointed to has been deleted.
              </p>
              <ClearFromInboxButton
                relatedTable={item.related_table as string}
                relatedId={item.related_id as string}
              />
            </div>
          ) : item.kind === 'guest_request' && subject && 'entryId' in subject ? (
            <GuestRequestItem tourId={item.tour_id} subject={subject} />
          ) : item.kind === 'email_extraction' && subject && 'forwardedEmailId' in subject ? (
            <ExtractionItem subject={subject} resolvedAt={item.resolved_at} />
          ) : (
            <div className="space-y-2">
              {item.detail && <p className="text-sm text-muted-foreground">{item.detail}</p>}
              <p className="text-sm text-muted-foreground">This item type doesn&rsquo;t have a review view yet.</p>
            </div>
          )}
        </>
      )}
    </PageLayout>
  )
}
