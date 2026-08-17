// Pure grouping for the Inbox (brief 53). Takes whatever order fetchInbox
// returned items in and buckets them by artist without re-sorting anything,
// so the caller's order (created_at, newest first) decides which artist's
// group leads: the artist with the most recent open item, not whichever
// artist's name sorts first.

export interface InboxItem {
  id: string
  tour_id: string
  tour_name: string
  // The zone this item's relative label renders in: the related show's own
  // resolved venue zone when the item is joined to one (e.g. a guest request),
  // otherwise the tour's fallback. See resolveTimezone in
  // lib/schedule/datetime.ts.
  timezone: string | null
  artist_id: string
  artist_name: string
  kind: string
  severity: number
  title: string
  detail: string | null
  related_table: string | null
  related_id: string | null
  created_at: string
  read_at: string | null
}

export interface InboxGroup {
  artist_id: string
  artist_name: string
  items: InboxItem[]
}

/**
 * Groups items by artist_id, preserving the order artists first appear in
 * `items`. A `Map` is the mechanism: JS iterates a Map's keys in insertion
 * order, so the first item for an artist decides that artist's position and
 * nothing re-sorts the groups afterwards. An artist with no open items never
 * has an item pointing at it, so it never gets a group.
 */
export function groupByArtist(items: InboxItem[]): InboxGroup[] {
  const groups = new Map<string, InboxGroup>()

  for (const item of items) {
    let group = groups.get(item.artist_id)
    if (!group) {
      group = { artist_id: item.artist_id, artist_name: item.artist_name, items: [] }
      groups.set(item.artist_id, group)
    }
    group.items.push(item)
  }

  return Array.from(groups.values())
}
