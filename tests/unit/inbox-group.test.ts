import { describe, it, expect } from 'vitest'
import { groupByArtist, type InboxItem } from '@/lib/inbox/group'

// REE-149. groupByArtist is pure: it never re-sorts, it only buckets the
// order fetchInbox already produced (created_at, newest first). These tests
// build that order by hand, in whatever sequence each case needs, rather than
// hitting a database.

function item(over: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'item-1',
    tour_id: 'tour-1',
    tour_name: 'Test Tour',
    timezone: 'Europe/London',
    artist_id: 'artist-1',
    artist_name: 'Test Artist',
    kind: 'email_extraction',
    severity: 3,
    title: 'Forwarded email',
    detail: null,
    related_table: null,
    related_id: null,
    created_at: '2026-08-12T10:00:00.000Z',
    read_at: null,
    ...over,
  }
}

describe('groupByArtist', () => {
  it('collapses two tours for one artist into one group', () => {
    const items = [
      item({ id: 'a', tour_id: 'tour-1', tour_name: 'Tour One', artist_id: 'artist-1', artist_name: 'Zed' }),
      item({ id: 'b', tour_id: 'tour-2', tour_name: 'Tour Two', artist_id: 'artist-1', artist_name: 'Zed' }),
    ]

    const groups = groupByArtist(items)

    expect(groups).toHaveLength(1)
    expect(groups[0].artist_id).toBe('artist-1')
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups[0].items.map((i) => i.tour_id)).toEqual(['tour-1', 'tour-2'])
  })

  it('orders groups by the first item, not by artist name', () => {
    // "Zed" sorts after "Alpha" alphabetically, but its item is first in the
    // input (the newer one, had this come from fetchInbox), so its group
    // must lead.
    const items = [
      item({ id: 'newer', artist_id: 'artist-zed', artist_name: 'Zed', created_at: '2026-08-12T10:00:00.000Z' }),
      item({ id: 'older', artist_id: 'artist-alpha', artist_name: 'Alpha', created_at: '2026-08-11T10:00:00.000Z' }),
    ]

    const groups = groupByArtist(items)

    expect(groups.map((g) => g.artist_name)).toEqual(['Zed', 'Alpha'])
  })

  it('never produces a group for an artist with no open items', () => {
    const groups = groupByArtist([])

    expect(groups).toEqual([])
  })
})
