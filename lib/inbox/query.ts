import type { createClient } from '@/lib/supabase/server'
import type { InboxItem } from '@/lib/inbox/group'
import { resolveTimezone } from '@/lib/schedule/datetime'

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

  const rows = data ?? []

  // Batched second read: a guest_request row is joined to a show through its
  // guest_list_entries row, and that show's own resolved venue zone should win
  // over the tour's fallback for this item's relative label, the same rule
  // every other reader of tours.timezone now follows (Brief 56). Guarded
  // against an empty id list before the .in(), which would otherwise be a
  // round trip that can only return nothing.
  const guestRequestEntryIds = rows
    .filter((row) => row.kind === 'guest_request' && row.related_table === 'guest_list_entries' && row.related_id)
    .map((row) => row.related_id as string)
  const showTimezoneByEntryId = await fetchShowTimezonesForEntries(supabase, guestRequestEntryIds)

  const items: InboxItem[] = rows.map((row) => {
    const tour = row.tours as unknown as {
      name: string
      timezone: string | null
      artists: { id: string; name: string }
    }

    const show =
      row.kind === 'guest_request' && row.related_id
        ? (showTimezoneByEntryId.get(row.related_id) ?? null)
        : null

    return {
      id: row.id,
      tour_id: row.tour_id,
      tour_name: tour.name,
      timezone: resolveTimezone(show ?? { timezone: null }, tour.timezone),
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

// A show's resolved timezone per guest_list_entries id, for every guest_request
// item in one batch read rather than one query per row.
async function fetchShowTimezonesForEntries(
  supabase: Client,
  entryIds: string[],
): Promise<Map<string, { timezone: string | null }>> {
  const map = new Map<string, { timezone: string | null }>()
  if (entryIds.length === 0) return map

  const { data } = await supabase
    .from('guest_list_entries')
    .select('id, shows ( timezone )')
    .in('id', entryIds)

  for (const row of data ?? []) {
    const show = row.shows as unknown as { timezone: string | null } | null
    map.set(row.id, { timezone: show?.timezone ?? null })
  }

  return map
}

export interface InboxCountResult {
  count: number
  error: string | null
}

// A head-count of the exact rows fetchInbox returns, for the nav badge
// (REE-151). Its own query rather than items.length off a full fetchInbox
// call, so the layout, which runs on every request under (app), is not
// pulling down and discarding every open item's detail just to render a
// number in the sidebar. Same filters as fetchInbox, so the two never
// disagree about what counts as open.
export async function fetchOpenItemCount(supabase: Client, accountId: string): Promise<InboxCountResult> {
  const { count, error } = await supabase
    .from('attention_items')
    .select('id, tours!inner ( account_id )', { count: 'exact', head: true })
    .is('resolved_at', null)
    .eq('tours.account_id', accountId)

  if (error) return { count: 0, error: error.message }
  return { count: count ?? 0, error: null }
}
