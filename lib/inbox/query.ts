import type { createClient } from '@/lib/supabase/server'
import type { InboxItem } from '@/lib/inbox/group'

// The account-wide open-items read behind the Inbox (brief 53). Every
// attention_items row across every tour the account owns, unresolved, newest
// first. Deliberately not filtered by read_at: the badge counts open items,
// not unread ones (REE-148), and this is the same read the badge count and
// the Inbox page both rest on, so a read item stays in the queue until it is
// resolved, not until someone opens it.

type Client = Awaited<ReturnType<typeof createClient>>

export interface InboxResult {
  items: InboxItem[]
  error: string | null
}

export async function fetchInbox(supabase: Client, accountId: string): Promise<InboxResult> {
  // PostgREST cannot filter or order by an embedded column: a `.eq`/`.order`
  // naming `tours.account_id` or `tours.name` changes nothing about which
  // parent rows come back (CLAUDE.md, "A filter on an embedded table needs
  // !inner"). Account scoping goes through `tours!inner`, which does filter
  // because it changes whether the join matches at all, and the ordering
  // stays on attention_items.created_at, a top-level column, never on the
  // joined tour or artist name.
  const { data, error } = await supabase
    .from('attention_items')
    .select(
      `
      id,
      tour_id,
      kind,
      severity,
      title,
      detail,
      related_table,
      related_id,
      created_at,
      read_at,
      tours!inner (
        name,
        account_id,
        timezone,
        artists!inner ( id, name )
      )
    `
    )
    .is('resolved_at', null)
    .eq('tours.account_id', accountId)
    .order('created_at', { ascending: false })

  // A failed read must never render as an empty result (CLAUDE.md). An empty
  // inbox and a broken query look identical from the outside, so the caller
  // needs the error to tell them apart rather than a confident, wrong "all
  // clear".
  if (error) return { items: [], error: error.message }

  const items: InboxItem[] = (data ?? []).map((row) => {
    const tour = row.tours as unknown as {
      name: string
      timezone: string | null
      artists: { id: string; name: string }
    }

    return {
      id: row.id,
      tour_id: row.tour_id,
      tour_name: tour.name,
      tour_timezone: tour.timezone,
      artist_id: tour.artists.id,
      artist_name: tour.artists.name,
      kind: row.kind,
      severity: row.severity,
      title: row.title,
      detail: row.detail,
      related_table: row.related_table,
      related_id: row.related_id,
      created_at: row.created_at,
      read_at: row.read_at,
    }
  })

  return { items, error: null }
}
