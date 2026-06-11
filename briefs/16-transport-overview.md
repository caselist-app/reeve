# Brief 16. Reeve — transport overview

## Goal

Build the top-level transport page: a clean, chronological view of every `transport_segment` on the tour. The TM can see at a glance how the whole party is moving, what is booked vs planned, and jump directly into a per-show planner to act. No new data entry happens here — the planner (Brief 06) and the show detail page are the write surfaces. This page reads.

## Why

The per-show planner is the right tool for planning a single leg. But a TM running a 30-date tour needs to see everything moving at once: who has confirmed bookings, which segments are still planned with no reference, and what comes up in the next 72 hours. Today that means opening each show individually. The transport overview surfaces the full picture in one place.

## Data shape

The page fetches all `transport_segments` for the tour, joined to their `transport_assignments` (for person count) and to their `shows` (to group by show and surface the show name and load-in). The query:

```sql
select
  ts.*,
  count(ta.id) as assigned_count,
  s.venue_name,
  s.date as show_date,
  s.load_in_at,
  s.id as show_id
from transport_segments ts
left join transport_assignments ta on ta.segment_id = ts.id
left join shows s on s.id = (ts.details_json->>'show_id')::uuid
where ts.tour_id = $tour_id
group by ts.id, s.id
order by ts.depart_at asc nulls last
```

Note: segments may have no linked show (manually added bus or truck legs between cities that do not correspond to a show). Surface these under a "Unlinked" heading rather than hiding them.

## Page layout

`app/(app)/tours/[id]/transport/page.tsx`

```
[PageHeader]
  eyebrow: artist act
  title: "Transport"
  description: "X segments — Y booked, Z planned"
  actions: [Filter: All | Flights | Rail | Road] (tab strip, not dropdown)

[Segment list — grouped by show date, then unlinked at the bottom]

  ── Hellfest  ·  Sat 21 Jun  ──────────────────────────────────

  ✈  Bordeaux → Nantes        Mon 20 Jun  08:40 – 09:50   Air France AF3201   3 people   Booked   [→ Planner]
  🚌  Nantes → Clisson (site)  Mon 20 Jun  11:15 – 11:55   Coach               8 people   Booked   [→ Planner]

  ── Werchter  ·  Thu 4 Jul  ───────────────────────────────────

  🚄  Brussels → Leuven        Wed 3 Jul   14:22 – 14:52   Thalys IC 3201      2 people   Planned  [→ Planner]
  🚌  Overnight bus             Wed 3 Jul   23:00 –          Party bus           12 people  Planned  [→ Planner]
```

## Segment row

Each row is a single `<tr>` in a full-width table. Columns:

| Mode icon | Route | Date + times | Carrier + ref | People | Status | Action |
|---|---|---|---|---|---|---|

- **Mode icon**: Lucide icon, 16px. `Plane` for flight, `Train` for rail, `Bus` for bus/coach, `Truck` for truck, `Car` for ground/hire. Colour-neutral (muted-foreground).
- **Route**: `origin → destination`. If either is null, show the `vehicle_or_flight_no` only. Truncate at 40 chars.
- **Date + times**: `Mon 20 Jun · 08:40 – 09:50`. If `arrive_at` is null (open-ended bus leg), show `08:40 – —`. Use the tour timezone.
- **Carrier + ref**: `Air France · AF3201`. If `booking_reference` is set, append it: `AF3201 · ABC123`. If neither, show the carrier name alone. Muted.
- **People**: `3 people` (count of `transport_assignments`). If 0, show `— ` in muted text.
- **Status badge**: small pill. `planned` = amber/5 text, amber/20 bg. `booked` = green/5 text, green/20 bg. `ticketed` = blue/5, blue/20. `changed` = orange. `cancelled` = muted strikethrough on the whole row, badge says "Cancelled".
- **Action**: `→ Planner` link. If the segment has a `show_id` in `details_json`, links to `/tours/[id]/shows/[showId]/planner`. If unlinked, links to `/tours/[id]/shows` (the TM can pick the right show). The link is text-style, not a button — it should not visually compete with the row.

Rows are not clickable inline. All edits happen in the planner. This page is read-only.

## Grouping and sort

Group by show, ordered by `show.date` ascending. Shows in the past are included (the TM needs the full history). Within a show group, order by `depart_at` ascending.

If a TM has filtered to "Flights" and a show has no flight segments, the show heading is suppressed entirely (do not show empty show groups).

"Unlinked" group always appears last.

## Filter strip

Three filter states: `All`, `Flights` (mode = 'flight'), `Rail` (mode = 'rail'), `Road` (mode in ('bus', 'truck', 'ground', 'hire')). Client-side filter — no refetch. Store the active filter in component state, not the URL.

The filter is a small tab strip in the PageHeader `actions` slot, not a dropdown. Keep it tight: the label text only, no icons in the strip.

## Empty state

If the tour has no transport segments at all:

```
  [Plane icon, 32px, muted]
  No transport on this tour yet.
  Add segments via the planner on each show.
  [Go to Shows →]
```

## Status summary line

The PageHeader `description` prop shows a live count: `"18 segments — 11 booked, 7 planned"`. Compute this server-side from the fetched data.

## Components

```
app/(app)/tours/[id]/transport/page.tsx      — server component, data fetch
components/transport/transport-view.tsx      — client component, filter state + table
components/transport/segment-row.tsx         — single table row
```

`TransportView` receives the full segment list server-side and handles client-side filtering. `SegmentRow` receives a single segment + its show context and renders the row.

## File locations

```
app/(app)/tours/[id]/transport/page.tsx
components/transport/transport-view.tsx
components/transport/segment-row.tsx
```

The sidebar stub in `components/nav/sidebar.tsx` currently maps `transport` to `shows`. Update `SECTION_ROUTE` to map `transport` to `transport` once this page is live.

## Acceptance criteria

- [ ] Page loads all segments for the tour in a single server-side fetch (no client-side fetching)
- [ ] Segments grouped by show, ordered by show date ascending
- [ ] Unlinked segments appear under a separate heading at the bottom
- [ ] Mode icon correct for all 6 modes (bus, truck, flight, rail, ground, hire)
- [ ] Status badge correct for all 5 statuses (planned, booked, ticketed, changed, cancelled)
- [ ] Cancelled rows are muted with strikethrough
- [ ] Filter strip: All / Flights / Rail / Road — client-side, no refetch
- [ ] Empty show groups suppressed when filter is active
- [ ] Planner link resolves correctly for linked segments; falls back to /shows for unlinked
- [ ] Status summary in PageHeader description is accurate
- [ ] Empty state rendered when tour has zero segments
- [ ] Sidebar `SECTION_ROUTE` updated: `transport` no longer stubs to `shows`
- [ ] No em-dashes in code, comments, or copy

## Common pitfalls

- Fetching transport_assignments in a separate query. Join them in the initial fetch so the page renders in a single round-trip.
- Making rows clickable for editing. This page is read-only. Edits go through the planner. Clicking a row should do nothing.
- Showing the "Unlinked" heading when there are no unlinked segments. Only render it when at least one unlinked segment exists.
- Using a dropdown for the filter. It should be a persistent tab strip in the header actions slot.
