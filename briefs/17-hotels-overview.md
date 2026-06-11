# Brief 17. Reeve — hotels overview

## Goal

Build the top-level hotels page: a clean chronological view of every `hotel_stay` on the tour, with room assignments and status at a glance. The TM can see what is confirmed, what is still planned, and navigate directly to a stay detail page to enter a confirmation number or adjust room assignments. This page is primarily a read surface, not a write surface.

## Why

The per-show hotel planner (Brief 07) is the right tool for searching and recording a single night. But over a 30-date tour the TM needs to see the full accommodation picture: which nights are confirmed, which hotels have outstanding confirmation numbers, and which properties have parking for the bus. Scrolling through individual shows to check this is slow. The hotels overview surfaces all of it at once.

## Data shape

The page fetches all `hotel_stays` for the tour, joined to their `room_assignments` (with person names) and linked to their `shows` via `details_json->>'show_id'` (same pattern as transport segments). The query:

```sql
select
  hs.*,
  count(ra.id) as room_count,
  s.venue_name,
  s.date as show_date,
  s.id as show_id
from hotel_stays hs
left join room_assignments ra on ra.hotel_stay_id = hs.id
left join shows s on s.id = (hs.details_json->>'show_id')::uuid
where hs.tour_id = $tour_id
group by hs.id, s.id
order by hs.check_in_date asc nulls last
```

Stays with no linked show appear under an "Unlinked" heading at the bottom.

## Page layout

`app/(app)/tours/[id]/hotels/page.tsx`

```
[PageHeader]
  eyebrow: artist act
  title: "Hotels"
  description: "X nights — Y confirmed, Z to book"
  actions: [Filter: All | To confirm | Confirmed] (tab strip)

[Stay list — grouped by show date]

  ── Hellfest  ·  Sat 21 Jun  ──────────────────────────────────

  Le Domaine de la Fief    Clisson    Check-in: Mon 20 Jun   Check-out: Tue 21 Jun   8 rooms   Confirmed   [→ Details]
  Chateau Gaillard         Clisson    Check-in: Mon 20 Jun   Check-out: Tue 21 Jun   3 rooms   Confirmed   [→ Details]

  ── Werchter  ·  Thu 4 Jul  ───────────────────────────────────

  Ibis Brussels Airport    Brussels   Check-in: Wed 3 Jul    Check-out: Thu 4 Jul    11 rooms  To confirm  [→ Details]
```

## Stay row

Each row is a single `<tr>` in a full-width table. Columns:

| Name | City | Check-in | Check-out | Rooms | Parking | Status | Action |
|---|---|---|---|---|---|---|---|

- **Name**: hotel name. If null, show "Unnamed property" in muted text.
- **City**: `city` column. If null, derive from `address` (first comma-separated part). If both null, empty.
- **Check-in**: `Mon 20 Jun`. Date only (no time) — check-in time is in the detail view.
- **Check-out**: `Tue 21 Jun`.
- **Rooms**: `8 rooms` (count of `room_assignments`). If 0, show `—` in muted text.
- **Parking**: small truck icon (`Truck`, 14px, muted) if `parking_json` has a truthy value (e.g. `{ "bus": true }`). Hidden otherwise. This is a quick visual signal for tours with a bus or truck.
- **Status badge**: `confirmation_number` is set and non-empty = `Confirmed` (green). Otherwise = `To confirm` (amber).
- **Action**: `→ Details` links to `/tours/[id]/shows/[showId]/hotels/[stayId]`. If unlinked, omit the `showId` segment — the detail page resolves the stay directly by `stayId` without requiring a show context (ensure the hotels/[stayId] page does not hard-require `showId` in its query; Brief 07 already does this).

Rows are not clickable inline. All edits happen in the detail page.

## Grouping and sort

Group by show, ordered by `show.date` ascending. Past shows are included. Within a show group, order by `check_in_date` ascending, then artist-tier stays before crew-tier (where determinable from `room_assignments`).

"Unlinked" group always appears last.

## Filter strip

Three states: `All`, `To confirm` (no confirmation number), `Confirmed` (confirmation number present). Client-side, no refetch. Tab strip in the PageHeader `actions` slot.

## Status summary line

`description` prop: `"24 nights — 16 confirmed, 8 to book"`. Computed server-side. "Nights" counts unique stays, not individual rooms.

## Empty state

```
  [Building2 icon, 32px, muted]
  No hotels on this tour yet.
  Add hotels via the planner on each show.
  [Go to Shows →]
```

## Confirmation number shortcut

When a stay has `status = 'to confirm'`, the `→ Details` link is styled slightly more prominently (normal font weight rather than muted) to draw the TM's attention. Do not add an inline edit field to this page — the detail page is the right place to enter a confirmation number. Keep this page clean.

## Components

```
app/(app)/tours/[id]/hotels/page.tsx      — server component, data fetch
components/hotels/hotels-view.tsx         — client component, filter state + table
components/hotels/stay-row.tsx            — single table row
```

## File locations

```
app/(app)/tours/[id]/hotels/page.tsx
components/hotels/hotels-view.tsx
components/hotels/stay-row.tsx
```

The sidebar stub in `components/nav/sidebar.tsx` currently maps `hotels` to `shows`. Update `SECTION_ROUTE` to map `hotels` to `hotels` once this page is live.

## Acceptance criteria

- [ ] Page loads all stays for the tour in a single server-side fetch
- [ ] Stays grouped by show, ordered by show date ascending
- [ ] Unlinked stays under a separate heading at the bottom
- [ ] Parking indicator shown when `parking_json` contains a truthy value
- [ ] Status badge: "Confirmed" (green) when confirmation_number is set; "To confirm" (amber) otherwise
- [ ] "To confirm" rows have a slightly more prominent action link
- [ ] Filter strip: All / To confirm / Confirmed — client-side, no refetch
- [ ] Empty show groups suppressed when filter is active
- [ ] Status summary in PageHeader description is accurate
- [ ] Empty state rendered when tour has zero stays
- [ ] Sidebar `SECTION_ROUTE` updated: `hotels` no longer stubs to `shows`
- [ ] No em-dashes in code, comments, or copy

## Common pitfalls

- Adding an inline confirmation number field to this page. It belongs in the detail view. This page is intentionally a read surface.
- Treating rooms count as the number of `room_types_json` entries rather than `room_assignments` rows. Count the assignments — they reflect who is actually assigned, not what was originally searched.
- Showing empty show groups when filtering. Suppress the heading entirely if all its stays are filtered out.
- Linking "unlinked" stays to a route that requires `showId`. The hotels/[stayId] page must resolve stays by stay ID alone.
