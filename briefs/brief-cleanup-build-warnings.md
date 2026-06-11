# Brief: Fix Build Warnings and Functional Gaps

**Status:** Ready to build  
**Priority:** High — no new features until this is done  
**Scope:** Three functional fixes, then dead-code cleanup

---

## Fix 1: Wire up the planner person-switcher

**File:** `components/planner/planner-workspace.tsx`

The `handlePersonChange` function (lines 84-89) and all Select component imports are in place but never rendered. The planner is stuck on the first person with a home city.

**What to do:**
- Add a `<Select>` to the planner UI that lists all people by name, bound to `selectedPersonId` and calling `handlePersonChange` on change.
- Place it near the top of the workspace, above the context summary, so the TM can switch travellers before running a plan.
- The function already resets `fromOverride`, `sameDayResults`, and `nightBeforeResults` on change, so no additional state logic is needed.

---

## Fix 2: Fix the resend loading state in advance documents

**File:** `components/shows/advance-documents.tsx`

The Resend button has a `disabled={isResending}` guard but `setResendingDoc` is never called, so it is always enabled. The imported `sendRider` action and `startTransition` are leftovers from an abandoned flow.

**What to do:**
- Remove the unused `sendRider` import (line 6).
- Remove `[resendingDoc, setResendingDoc]` state and the `[, startTransition]` destructure. The resend flow re-opens the send sheet (see `handleResend`), so no loading state is needed.
- Replace `isResending={resendingDoc === share.document_id}` in `<ShareStatus>` with `isResending={false}` or remove the prop and the disabled guard from `ShareStatus` entirely, since resend just opens a sheet and is instantaneous.

---

## Fix 3: Apply rail transit buffer in hub resolver

**File:** `lib/logistics/hub-resolver.ts`

`RAIL_TRANSIT_MIN` (15 min) is imported from constants but never used. When a venue resolves to a rail hub only (no IATA), the fallback ground time is `AIRPORT_TRANSIT_MIN` (45 min), which overstates the transit buffer for rail-only venues by 30 minutes.

**What to do:**
- In `resolveHub` (line 145), change the fallback from:
  ```ts
  ground_minutes: show.hub_ground_minutes ?? AIRPORT_TRANSIT_MIN,
  ```
  to:
  ```ts
  ground_minutes: show.hub_ground_minutes ?? (show.transport_hub_rail && !show.transport_hub_iata ? RAIL_TRANSIT_MIN : AIRPORT_TRANSIT_MIN),
  ```
- Apply the same logic in `planner-workspace.tsx` (line 73) where `groundMin` is derived, so the planner uses the right buffer when calculating required site arrival.

---

## Cleanup: Remove remaining dead code

Once the three fixes above are in, clean up the remaining warnings. No logic changes, just deletion:

- `app/(app)/tours/[id]/settings/page.tsx` — remove the stale `eslint-disable` comment on line 30.
- `components/nav/tour-selector.tsx` — remove the unused `DropdownMenuLabel` import.
- `components/planner/hotel-option-card.tsx` — remove the five unused Select imports (Select, SelectContent, SelectItem, SelectTrigger, SelectValue).
- `lib/actions/rehearsals.ts` — remove or prefix the unused `date` variable with `_`.
- `lib/logistics/adapters/google-transit.ts` — remove or prefix the unused `parseSteps` function with `_`.
- `lib/logistics/adapters/mock-hotels.ts` — remove or prefix the unused `price` variable with `_`.

---

## Definition of done

- `pnpm lint` returns zero warnings.
- `pnpm typecheck` is clean.
- `pnpm build` is clean.
- The planner shows a person selector and switching it resets the plan results.
- The resend button in advance documents has no defunct loading state logic.
- A rail-only venue uses 15-minute transit buffer, not 45.
