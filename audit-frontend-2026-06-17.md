# Reeve Front-End Audit: Performance + Design System

Date: 2026-06-17
Scope: two requests. (1) Make the app Notion-quick. (2) Stop re-creating UI ad hoc; reuse components (the popovers look different).
Status: investigation complete, no code changed. This doc is the sign-off plan. Each numbered commit below is meant to be reviewed and approved on its own before the next.

All findings cite `file:line`. Paths are relative to the repo root.

---

## TL;DR

Performance is held back by three structural patterns, all concentrated on the schedule day view (the main TM surface):
1. The same day's data is fetched two to three times per date click (~14 Supabase round-trips, roughly half redundant).
2. Every add/edit calls `router.refresh()`, forcing a full server re-render instead of optimistic UI. This is the single biggest reason it feels slower than Notion.
3. Nothing is code-split, and the heaviest routes have no instant skeleton, so the page blocks on the slowest query before anything paints.

The design system has drifted because there is no shared "overlay" or "card" abstraction. Floating menus are built three different ways, `StatusBadge` is re-implemented five times, and corner radius ranges across `lg`/`xl`/`2xl`/`3xl` for things that should match. The popover inconsistency you noticed is real and measurable: in `day-view-client.tsx`, two toolbar buttons one inch apart open menus with different radius and padding.

None of this is a rewrite. The foundations are sound (Server Components by default, `next/font`, prefetch on, `requireUser` cached, several pages already fetch correctly). These are targeted fixes.

---

## Part 1: Performance

### Commit P1: Kill the duplicate schedule fetches (P0, biggest single win)

What is wrong:
- `app/(app)/tours/[id]/schedule/page.tsx:60-145` fetches shows / segments / hotels / events for the selected day (7 queries) to build `panelData`.
- `components/schedule/day-timeline.tsx:80-140` (a child Server Component) fetches a nearly identical set again (7 more queries).
- `components/schedule/day-info-panel.tsx:18-73` fetches the show plus roster a third time.

Result: ~14+ queries per date navigation, about half pure duplication. Every click on a date in the sidebar pays this.

The fix:
- Fetch each day's shows/segments/hotels/events once in `page.tsx`. Pass the results to `DayTimeline` and `DayInfoPanel` as props.
- `DayTimeline` and `DayInfoPanel` stop calling `createClient()` for data they can receive as props.
- Keep the existing `Promise.all` parallelism in `page.tsx`; only the duplication is being removed.

Risk: low. Pure data-flow change, no schema, no behaviour change. Verify by counting queries before/after.

### Commit P2: Fix the DayInfoPanel waterfall (P0)

What is wrong:
- `components/schedule/day-info-panel.tsx:48-56` and `:65-72`: inside a `Promise.all`, each branch awaits a sub-query first (`transport_segments` ids, then `room_assignments`; `hotel_stays` ids, then `transport_assignments`). Because each branch blocks on its own inner await, the `Promise.all` cannot actually parallelize, so 2 logical queries run as 4 in series.

The fix:
- Resolve the segment-id and hotel-id lists in one parallel `Promise.all`, then run the two assignment queries in a second parallel `Promise.all`.
- Better: these ids are already fetched in Commit P1's consolidated query, so reuse them and drop the sub-queries entirely.

Risk: low. Fold into P1 if they touch the same fetch path.

### Commit P3: Optimistic UI, stop refreshing the whole route on every mutation (P0, defining Notion gap)

What is wrong:
- 18 sites call `router.refresh()` after an add/edit, which re-runs the route's Server Components and re-fetches everything (which, given P1, means re-running ~14 queries). The user sees a stall after every "Add".
- Sites: `components/schedule/add/add-flight-form.tsx:54`, `add-drive-form.tsx:77`, `add-show-form.tsx:35`, `add-hotel-form.tsx:38`, `add-event-form.tsx:49`, `add-rail-form.tsx:49`, `add-day-panel.tsx:58,92,159`, `people-view.tsx:44,55,63,74`, `roster-view.tsx:49,51,92`, `contact-detail.tsx:69`, `extractions-view.tsx:271`.

The fix:
- Use `useOptimistic` + `useTransition` to update the timeline/list locally on submit, then reconcile against the server result.
- Where a refresh is genuinely needed, have the server action return only the changed rows instead of relying on a blanket route refresh.

Risk: medium. This is the highest-value change but touches the most files. Recommend doing the schedule add-forms first (most visible), then the people/roster views, as separate sub-commits so each is reviewable.

### Commit P4: Instant skeletons + streaming on the heavy routes (P0)

What is wrong:
- `app/(app)/tours/[id]/schedule/` and `app/(app)/tours/[id]/shows/[showId]/` have no `loading.tsx`. The generic `(app)/loading.tsx` fallback does not match the three-column day layout, so navigation flashes a mismatched skeleton then jumps.
- There is zero `Suspense` usage in the codebase, so the whole page blocks on the slowest query before any paint.

The fix:
- Add `schedule/loading.tsx` that renders the three-column shell (date sidebar + empty timeline + panel) so the frame appears instantly.
- Wrap `DayTimeline` and `DayInfoPanel` in `<Suspense>` with skeletons so the fast date-sidebar query streams immediately while day content fills in.
- Same treatment for `shows/[showId]`.

Risk: low to medium. New files plus Suspense boundaries; no data changes.

### Commit P5: Code-split panels and add-forms (P0)

What is wrong:
- `components/layout/active-panel.tsx:4-10` statically imports 8 panel components (`PersonSheet` 408 lines, `ContactSheet` 399, `ContactPanel`, `BulkAdd`, `AddShowPanel`, `SendRiderSheet`, `AddDayPanel`). `ActivePanel` mounts in the global `(app)/layout.tsx` on every page.
- `components/schedule/add/add-flow.tsx:4-9` statically imports all 6 add-forms into the schedule bundle.
- No `next/dynamic` anywhere.

Result: the largest interactive forms ship and hydrate on first paint of every relevant page even though none is visible until the user opens a panel.

The fix:
- `next/dynamic(() => import(...), { ssr: false })` for each panel branch in `ActivePanel` and each form in `AddFlow`. They only mount on user action, so lazy-loading costs nothing in UX and meaningfully cuts the initial client bundle.

Risk: low. Verify with `pnpm build` route-level "First Load JS" before/after.

### Commit P6: Populate next.config + explicit column selects (P1)

What is wrong:
- `next.config.ts:3` is empty (`{}`). No `optimizePackageImports`.
- `select('*')` over-fetch at `people/page.tsx:26` (`contacts(*)`, shipped to a client component, more PII to the browser than needed), `shows/[showId]/page.tsx:57-59`, `roster/[contactId]/page.tsx:18`, `transport/page.tsx:35`, `hotels/page.tsx:31`.

The fix:
- Add `experimental.optimizePackageImports: ['lucide-react']` (40 lucide import sites) to `next.config.ts`.
- Replace `select('*')` with explicit column lists, mirroring the good pattern already in `roster/page.tsx:16`. Prioritize the people page so the browser stops receiving full contact rows.

Risk: low. Column lists must match what each surface renders; the generated types will catch drift.

### Commit P7: Server-render the lists, client-leaf only the buttons (P1)

What is wrong:
- `components/people/people-view.tsx`, `people-table.tsx`, `shows/shows-view.tsx`, `roster/roster-view.tsx`, `schedule/schedule-view.tsx` are all `'use client'`, almost entirely to call `useSidePanel().open()` and `router.refresh()`. The list rendering itself is static, server-renderable data.

The fix:
- Keep list rendering as Server Components; extract only the interactive button (Add / row-click) into a small client leaf that calls the store. `timeline-card.tsx` is already the correct model for this split; apply it here.
- Worst offenders by likely cost: `people-table.tsx`, `schedule-view.tsx` (206 lines), `shows-view.tsx`.

Risk: medium. Restructures component boundaries; pairs naturally with P3 (both touch these files).

### Lower priority (note, do later)

- Double auth round-trip per navigation: `middleware.ts` validates the JWT via `getUser()`, then each page's `requireUser()` calls `getUser()` again. Both are correct security-wise (do not switch to `getSession`), but the middleware result is not reused. Optional: pass the validated signal via a request header so the page can skip the second round-trip. (P1, but riskier; treat separately.)
- Zustand whole-store subscriptions everywhere (no selectors). Low impact because the stores change rarely, except `timeline-card.tsx:18-20` subscribes to `activeCard` and runs `JSON.stringify(activeCard) === JSON.stringify(card)` on every render of every card, so all cards re-render on each selection. Fix with a selector and a cheap field comparison. (P2)
- No list virtualization. Fine at current scale; revisit at 100+ tour days or 500+ contacts. (P2)

### What is already good (do not touch)

`schedule/page.tsx` and `roster/page.tsx` use `Promise.all` correctly; roster selects explicit columns and avoids N+1. `requireUser` is `React.cache`-wrapped. `next/font` (Geist) is correct. Prefetch is on for all Links. No raw `<img>`. `timeline-card.tsx` is the reference pattern for server-list/client-leaf.

Note: the `.next` build on disk is a dev build, so absolute bundle sizes are not production-representative. Run `pnpm build` and read the route-level "First Load JS" table to quantify P5 before sign-off.

---

## Part 2: Design system

### Commit D1: Unify the overlay tokens (P0, fixes the popover complaint, zero call-site changes)

What is wrong: floating menus are built three different ways and do not match.
- Mechanism A, Radix Popover (`components/ui/popover.tsx`): `rounded-md`, `p-4`, `shadow-md`, `w-72`.
- Mechanism B, Radix DropdownMenu (`components/ui/dropdown-menu.tsx`): `rounded-lg`, `p-1`, `shadow-md`.
- Mechanism C, hand-rolled absolutely-positioned div with manual Escape and outside-click listeners: `components/nav/tour-settings-panel.tsx:46-85`.

The headline example: `components/schedule/day-view-client.tsx`. The "Day options" menu (`:174-197`) uses DropdownMenu (`rounded-lg`, `p-1`); the "Add to day" menu (`:200-217`) uses Popover (`w-56 p-2`, `rounded-md`). Two buttons an inch apart, different radius and padding. That is the complaint in one screen.

The fix:
- Make `PopoverContent` and `DropdownMenuContent` share one radius and one shadow (recommend `rounded-xl` to match the app's rounded language, or at minimum make them equal). Set it in the two `ui/` files. Every consumer inherits it; no call sites change.
- This single edit fixes the day-view side-by-side mismatch and the general "popovers look different" feel.

Risk: very low. Two files, token-only.

### Commit D2: One mechanism per semantic, retire the hand-rolled menu (P0/P1)

What is wrong:
- `components/planner/departure-selector.tsx:71-152` is a form (inputs + a Button) crammed into a `DropdownMenuContent`. Menus are for item lists, not forms; this should be a Popover.
- `components/nav/tour-settings-panel.tsx:46-85` is the only true third panel pattern: a bespoke `absolute inset-0 -translate-x-full` div with its own Escape (`:28-33`) and outside-click (`:36-44`) listeners, duplicating what Radix already provides.

The fix:
- Action lists (Edit/Delete, Day options, tour switcher) use DropdownMenu everywhere. Rich content with inputs (Add picker, departure selector) use Popover everywhere.
- Re-express `tour-settings-panel` as a Popover or as a slide panel reusing the side-panel store. Remove the hand-rolled listeners.

Risk: medium. Behaviour-preserving but touches interaction code; review each individually.

### Commit D3: Route every pill through StatusBadge (P1)

What is wrong: `StatusBadge` (`components/ui/status-badge.tsx`, `rounded-full px-2 py-0.5 text-xs font-medium`, semantic variants) is re-implemented five times, each slightly different:
- `components/extractions/extractions-view.tsx:251-263`: a private component literally named `StatusBadge` shadowing the primitive; `text-[11px]`, colors `-600` instead of `-700`.
- `components/transport/segment-row.tsx:135-142`: local `STATUS_CLASS` map duplicating the existing `TRANSPORT_VARIANT`.
- `components/hotels/stay-row.tsx:99-108`: `bg-green-500/10 text-green-600`.
- `components/planner/hotel-stay-detail.tsx:70-76`: `bg-green-100 text-green-700` (a third green recipe).
- `components/schedule/day-header.tsx:188-190`: square day-type pill (`rounded-md`), driven by a local `PILL` map.

Five pills, four greens, three radii, three text sizes.

The fix:
- Route all five through `StatusBadge`. Extend its variant maps (add hotel/confirmed alongside `TRANSPORT_VARIANT`/`PASSPORT_VARIANT`). Add a `shape?: 'pill' | 'tag'` prop for the square day-type case. Delete the shadow component and the local `STATUS_CLASS`/`PILL` maps.

Risk: low. Visual diff worth eyeballing per surface.

### Commit D4: Migrate ContactPanel to PanelShell (P1)

What is wrong:
- `components/roster/contact-panel.tsx:91-158` is a global side panel but does not use `PanelShell`. It hand-rolls the entire header and close button. Its siblings (`person-sheet`, `contact-sheet`, `send-rider-sheet`, `add-show-panel`) all use `PanelShell` correctly. It diverged only because it needs a header actions menu, but `PanelShell` already accepts a `headerAction` prop for exactly that.
- The mandated card/panel token is exactly `rounded-3xl border border-border bg-background`. It appears correctly only in `components/layout/app-content.tsx:44` and `:61`. `command-palette.tsx:143` uses `rounded-2xl` (wrong radius; acceptable as the one deliberate modal exception, or align it).

The fix:
- Migrate `ContactPanel` to `PanelShell` with `headerAction={<DropdownMenu .../>}`. Removes the only divergent panel header.

Risk: low to medium.

### Commit D5: One ListRow primitive (P1)

What is wrong: the clickable list row (`rounded-xl border border-border ... px-4 py-3 ... hover:bg-muted/50`) is copy-pasted across seven files, drifting on radius:
- `people-table.tsx:58`, `roster/contact-detail.tsx:171`, `roster/contact-panel.tsx:230`, `tours/attention-feed.tsx:34,52`, `roster/roster-view.tsx:91`, `extractions-view.tsx:117` (a `bg-card p-5` variant). Compare `schedule-view.tsx:133` and `timeline-card.tsx:47` at `rounded-lg`.
- The shadcn `Card` (`components/ui/card.tsx`) is dead (imported nowhere), as is `components/ui/sheet.tsx`. This is the root cause of the radius drift: there is no shared card.

The fix:
- Introduce one `ListRow` (or adopt/restyle `ui/card.tsx`) with `interactive?` and `severity?` props. Standardize a single radius for row-level surfaces. Migrate the seven sites.

Risk: medium (touches many surfaces). Good candidate to do after D1 to D4 land.

### Commit D6: SectionHeader everywhere + DataField for stray label/value (P2)

What is wrong:
- `SectionHeader`'s exact class string is hand-typed ~15 times: `person-sheet.tsx:169,232,253,296,336`, `contact-sheet.tsx:152,207,228,291,326`, `extractions-view.tsx:150,168,189`, `tour-settings-panel.tsx:55`. Near-misses with different tracking in `advance-documents.tsx:157`, `departure-selector.tsx:80`, `notify-panel.tsx:123,133,145`.
- The passport-expiry label/value block is hand-built (instead of `DataField`) and duplicated in `roster/contact-detail.tsx:129` and `roster/contact-panel.tsx:174`, also `schedule-view.tsx:152`.

The fix:
- Replace hand-rolled headers with `<SectionHeader>`, using its `className` escape hatch for the sidebar color override. `person-sheet` and `contact-sheet` are ~90% the same form and could share section markup.
- Use `DataField` for the duplicated passport-expiry blocks.

Risk: very low. Cosmetic, do last.

### Cleanup worth noting

- `components/ui/card.tsx` and `components/ui/sheet.tsx` are dead. Either adopt `Card` as the basis for the `ListRow` work (D5) or delete both so they stop implying a system that is not used.
- The four close-X buttons in `panel-shell.tsx`, `edit-panel.tsx`, `contact-panel.tsx`, `tour-settings-panel.tsx` are copy-pasted; an `IconButton` (or `Button variant="ghost" size="icon"`) would cover those and the two ad-hoc 8x8 toolbar buttons in `day-view-client.tsx:178-183,202-209`.

### What is already healthy (do not touch)

`Button`, `Input`, `Textarea`, `Select`, `Label` are used widely and correctly. `AlertDialog` is used consistently for confirmations across the app (it is a modal, which is allowed). The two sanctioned panel shells (`PanelShell`, `EditPanel`) are correct; their small header padding difference is the documented two-systems split, not drift.

---

## Suggested order

Both goals share a cheap, high-impact opening move, then the heavier structural work:

1. D1 (unify overlay tokens) and P6 (`next.config` + column selects) first: tiny, low-risk, immediately visible.
2. P1 + P2 (dedupe schedule fetches, fix waterfall): the core speed win.
3. D3 (StatusBadge) and D4 (ContactPanel to PanelShell): visible consistency wins.
4. P3 (optimistic UI) and P4 (skeletons/streaming): the biggest "feels like Notion" change, but the most code, so reviewed in sub-commits.
5. P5 (code-split) and P7 (server-render lists): bundle and hydration.
6. D2, D5, D6 and cleanup: the rest of the design-system consolidation.

Nothing here changes the database, so no migrations are involved. Each commit above is independently reviewable; I will pause for sign-off before each.
