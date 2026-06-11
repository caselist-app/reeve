# Brief 22: Side Panel

## What this is

Every shadcn `<Sheet>` in the app is replaced with a persistent side panel that slides in from the right. The panel is a card — same `rounded-3xl border border-border bg-background` style as the main content area. When a panel opens, the main content shrinks to the left to make room; there is no overlay, no backdrop, no full-screen takeover.

This is the pattern Croft uses for its email side panel. Port it faithfully. The reference implementation is:
- `components/layout/app-content.tsx` in the Croft codebase
- `stores/email-side-panel-store.ts` in the Croft codebase

The panel is also the foundation for future detail views: show detail, person detail, transport segment, hotel stay. Build it generically. Adding a new panel type later is one new entry in a discriminated union — nothing else changes.

---

## Why

The shadcn Sheet is a viewport-width overlay that covers the content the TM was just looking at. It feels heavy and disconnected from the data underneath it. The Croft-style panel keeps the context visible on the left while the detail or form fills the right, which is the interaction model that belongs in a desktop-first tool.

---

## What does NOT change

- The form logic, field layout, and validation inside each sheet component. None of that moves.
- `CommandPalette` — not a sheet, not touched.
- `ResizableSidebar` — not touched.
- `components/ui/sheet.tsx` — leave the file in place. Just stop using it in the six converted files.
- Any sheet that does not yet exist in the codebase. Only the six currently using shadcn `<Sheet>` are converted here.

---

## Sheets being converted

Six components currently import from `@/components/ui/sheet`:

| Component | Panel title | Current props driving open state |
|---|---|---|
| `components/people/person-sheet.tsx` | `Add {type}` / `Edit {name}` | `open`, `onOpenChange`, `onSuccess` |
| `components/people/bulk-add.tsx` | `Bulk add crew` | `open` (internal), `onSuccess` |
| `components/roster/contact-sheet.tsx` | `New contact` / `Edit {name}` | `open`, `onOpenChange`, `onSuccess` |
| `components/shows/shows-view.tsx` | `Add show` | local `addOpen` state |
| `components/shows/send-rider-sheet.tsx` | `Send {dept} advance` | `open`, `onOpenChange`, `onSent` |
| `components/schedule/schedule-view.tsx` | `Add day` | `open`, `onOpenChange` on `AddDaySheet` |

All six are converted. No new shadcn Sheet usage is introduced anywhere in the app.

---

## What to build

### 1. Zustand store — `stores/side-panel-store.ts`

One store controls which panel is open. Use a discriminated union on `type` so TypeScript enforces the right props for each panel.

```ts
import { create } from 'zustand'
import type { Tables } from '@/lib/types/database'
import type { PersonWithContact } from '@/components/people/people-view'
import type { SendableDocument, ContactablePerson } from '@/components/shows/send-rider-sheet'

type PersonType = 'artist' | 'crew' | 'management' | 'support'

// Import or re-declare ContactRow from contact-sheet if not already exported.
type ContactRow = Tables<'contacts'>

export type PanelDescriptor =
  | { type: 'person'; tourId: string; defaultType: PersonType; person: PersonWithContact | null; crewDetail: Tables<'crew_detail'> | null; onSuccess: () => void }
  | { type: 'bulk-add'; tourId: string; onSuccess: () => void }
  | { type: 'contact'; tourId: string; contact: ContactRow | null; onSuccess: () => void }
  | { type: 'add-show'; tourId: string; onSuccess: (showId: string) => void }
  | { type: 'send-rider'; tourId: string; showId: string; departmentLabel: string; documents: SendableDocument[]; people: ContactablePerson[]; onSent: () => void }
  | { type: 'add-day'; tourId: string }

interface SidePanelState {
  panel: PanelDescriptor | null
  isOpen: boolean
  open: (descriptor: PanelDescriptor) => void
  close: () => void
}

export const useSidePanel = create<SidePanelState>()((set) => ({
  panel: null,
  isOpen: false,
  open: (descriptor) => set({ panel: descriptor, isOpen: true }),
  close: () => set({ isOpen: false }),
}))
```

`isOpen` and `panel` are separate so the panel content stays mounted during the exit animation (the panel type does not clear to null until after the animation completes — see `AppContent` below).

Do not persist this store to localStorage. Panel state is transient; a hard reload should not reopen a panel.

Callbacks (`onSuccess`, `onSent`) are functions stored in Zustand state. This is intentional: they are stable references passed in at `open()` call time and consumed inside the panel component. They are not stored in localStorage (the store is not persisted), so this is safe.

### 2. Layout container — `components/layout/app-content.tsx`

Client Component. Reads the store, manages the mount/unmount delay, and renders the main content area plus the panel.

```tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { ActivePanel } from '@/components/layout/active-panel'

interface AppContentProps {
  children: React.ReactNode
}

export function AppContent({ children }: AppContentProps) {
  const { isOpen } = useSidePanel()

  // Keep the panel in the DOM for 200ms after isOpen goes false so the
  // exit animation completes before the component unmounts.
  const [showPanel, setShowPanel] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setShowPanel(true)
    } else {
      const t = setTimeout(() => setShowPanel(false), 200)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  return (
    <div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
      <main
        className={cn(
          'min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden transition-[flex] duration-200 ease-out',
          isOpen ? 'lg:flex-1 w-0' : 'flex-1',
        )}
      >
        {children}
      </main>

      <div
        className={cn(
          'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-[480px] w-full' : 'w-0',
        )}
      >
        {showPanel && (
          <div
            className={cn(
              'h-full bg-background border border-border rounded-3xl overflow-hidden transition-transform duration-200 ease-out',
              isOpen ? 'translate-x-0' : 'translate-x-full',
            )}
          >
            <ActivePanel />
          </div>
        )}
      </div>
    </div>
  )
}
```

Panel width is `lg:w-[480px]` (fixed, not percentage). A fixed width means the main content area does not keep jumping as panels with different content widths open and close. On mobile it takes full width (`w-full`) because the `lg:` breakpoint does not apply.

### 3. Panel router — `components/layout/active-panel.tsx`

Client Component. Reads `panel` from the store and renders the right content component.

```tsx
'use client'

import { useSidePanel } from '@/stores/side-panel-store'
import { PersonSheet } from '@/components/people/person-sheet'
import { BulkAdd } from '@/components/people/bulk-add'
import { ContactSheet } from '@/components/roster/contact-sheet'
import { AddShowPanel } from '@/components/shows/add-show-panel'
import { SendRiderSheet } from '@/components/shows/send-rider-sheet'
import { AddDayPanel } from '@/components/schedule/add-day-panel'

export function ActivePanel() {
  const { panel } = useSidePanel()
  if (!panel) return null

  switch (panel.type) {
    case 'person':
      return <PersonSheet {...panel} />
    case 'bulk-add':
      return <BulkAdd {...panel} />
    case 'contact':
      return <ContactSheet {...panel} />
    case 'add-show':
      return <AddShowPanel {...panel} />
    case 'send-rider':
      return <SendRiderSheet {...panel} />
    case 'add-day':
      return <AddDayPanel {...panel} />
  }
}
```

Each component receives its props directly from the spread of the panel descriptor. TypeScript narrows on `panel.type` and enforces the right prop shape for each case.

### 4. Shared panel chrome — `components/layout/panel-shell.tsx`

Client Component. Standard header with title and close button, scrollable body beneath. All converted panels use this wrapper.

```tsx
'use client'

import { X } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'

interface PanelShellProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function PanelShell({ title, description, children }: PanelShellProps) {
  const { close } = useSidePanel()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0 border-b border-border">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={close}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {children}
      </div>
    </div>
  )
}
```

### 5. Wire into the app layout — `app/(app)/layout.tsx`

Replace the hardcoded `<div>` wrapper and `<main>` with `<AppContent>`. The layout file stays a Server Component; `AppContent` is the Client Component boundary.

Before:
```tsx
<div className="flex h-screen overflow-hidden bg-sidebar">
  <ResizableSidebar ... />
  <div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
    <main className="flex-1 min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden">
      {children}
    </main>
  </div>
  <CommandPalette />
</div>
```

After:
```tsx
<div className="flex h-screen overflow-hidden bg-sidebar">
  <ResizableSidebar ... />
  <AppContent>{children}</AppContent>
  <CommandPalette />
</div>
```

### 6. Convert each sheet

The internal form logic inside each component does not change. The only changes are:

1. Remove the `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`, `SheetDescription` imports and their JSX.
2. Remove the `open` and `onOpenChange` props (the store drives open/close state now).
3. Wrap the content in `<PanelShell title="...">`.
4. Replace `onOpenChange(false)` call sites inside the component with `useSidePanel().close()`.
5. Keep `onSuccess` / `onSent` callbacks: they are passed in through the store descriptor and called exactly as before.

The `key` prop trick on the form in `PersonSheet` (which forces a remount on each open) can be simplified: because the panel now unmounts after close (the `showPanel` delay handles exit animation, then `showPanel` goes false), the form always mounts fresh. The `key` trick is no longer needed but is harmless if left in.

#### `components/people/person-sheet.tsx`

Remove props: `open`, `onOpenChange`.
Keep props: `tourId`, `defaultType`, `person`, `crewDetail`, `onSuccess`.
Replace `onOpenChange(false)` in the success path with `useSidePanel().close()`, then call `onSuccess()`.
Wrap content in `<PanelShell title={isEditing ? \`Edit ${person.contacts.name}\` : \`Add ${personType}\`} description={...}>`.

#### `components/people/bulk-add.tsx`

The sheet currently manages its own `open` state internally (it is opened via a button inside `people-view.tsx`). After conversion, the open button in `people-view.tsx` calls `useSidePanel().open({ type: 'bulk-add', tourId, onSuccess })` instead.
Remove all `Sheet` wrapping from `bulk-add.tsx`. Export just the form content.
Wrap in `<PanelShell title="Bulk add crew" description="...">`.

#### `components/roster/contact-sheet.tsx`

Remove props: `open`, `onOpenChange`.
Keep props: `tourId`, `contact`, `onSuccess`.
Replace `onOpenChange(false)` with `useSidePanel().close()`, then call `onSuccess()`.
Wrap in `<PanelShell title={contact ? \`Edit ${contact.name}\` : 'New contact'} description={...}>`.

#### `components/shows/shows-view.tsx`

Currently manages `const [addOpen, setAddOpen] = useState(false)`. Replace: the "Add show" button calls `useSidePanel().open({ type: 'add-show', tourId, onSuccess: (showId) => router.push(...) })`. Remove the local `addOpen` state, the `Sheet` import, and the inline `<Sheet>` JSX. The form content that was inside `SheetContent` moves to a new component — see below.

#### `components/shows/send-rider-sheet.tsx`

Remove props: `open`, `onOpenChange`.
Keep props: `tourId`, `showId`, `departmentLabel`, `documents`, `people`, `onSent`.
Replace the two `onOpenChange(false)` call sites with `useSidePanel().close()`. Call `onSent()` as before.
Wrap in `<PanelShell title={\`Send ${departmentLabel} advance\`}>`.

The call site in `advance-documents.tsx` that passes `open` and `onOpenChange` as props changes to calling `useSidePanel().open({ type: 'send-rider', ... })` when the "Send to venue" button is clicked.

#### `components/schedule/schedule-view.tsx`

The `AddDaySheet` sub-component inside this file manages its own `open`/`onOpenChange`. Extract `AddDaySheet`'s content into `components/schedule/add-day-panel.tsx` (a plain component with no sheet wrapping). The "Add day" button in `schedule-view.tsx` calls `useSidePanel().open({ type: 'add-day', tourId })`. Replace `onOpenChange(false)` call sites inside the form with `useSidePanel().close()`.

---

## New components vs. extracted content

Two of the six conversions require extracting form content into new standalone files because the form was inline inside a larger component (not a separate file already):

- `components/shows/add-show-panel.tsx` — extracted from the inline sheet in `shows-view.tsx`. Contains the Add Show form. Accepts `tourId` and `onSuccess` from the store descriptor.
- `components/schedule/add-day-panel.tsx` — extracted from `AddDaySheet` inside `schedule-view.tsx`. Contains the Add Day form. Accepts `tourId` from the store descriptor.

Both wrap in `<PanelShell>`.

---

## Escape key handling

The `PanelShell` close button covers explicit close. Add a global `keydown` listener in `AppContent` that calls `close()` when `Escape` is pressed and a panel is open. Mirror the Croft pattern exactly:

```tsx
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) {
      e.preventDefault()
      close()
    }
  }
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [isOpen, close])
```

---

## File checklist

New files:
- `stores/side-panel-store.ts`
- `components/layout/app-content.tsx`
- `components/layout/active-panel.tsx`
- `components/layout/panel-shell.tsx`
- `components/shows/add-show-panel.tsx` (extracted from `shows-view.tsx`)
- `components/schedule/add-day-panel.tsx` (extracted from `schedule-view.tsx`)

Modified files:
- `app/(app)/layout.tsx` — swap wrapper for `<AppContent>`
- `components/people/person-sheet.tsx` — remove Sheet, use PanelShell, drop open/onOpenChange props
- `components/people/bulk-add.tsx` — remove Sheet, use PanelShell, drop internal open state
- `components/people/people-view.tsx` — open button calls store instead of local state
- `components/roster/contact-sheet.tsx` — remove Sheet, use PanelShell, drop open/onOpenChange props
- `components/roster/roster-view.tsx` — open button calls store
- `components/shows/shows-view.tsx` — remove inline Sheet, open button calls store
- `components/shows/send-rider-sheet.tsx` — remove Sheet, use PanelShell, drop open/onOpenChange props
- `components/shows/advance-documents.tsx` — open button calls store
- `components/schedule/schedule-view.tsx` — remove AddDaySheet, open button calls store

---

## Decisions (resolved)

1. **Fixed panel width, not percentage.** `lg:w-[480px]` gives a stable content area. A percentage width causes the panel and main area to jump to different widths on different screen sizes, which looks wrong. The main content flexes to fill the remaining space.
2. **Callbacks stored in the Zustand descriptor, not refs.** The callbacks (`onSuccess`, `onSent`) are passed in at `open()` time and read inside the panel. The store is not persisted, so there is no serialisation concern. This keeps the pattern simple and matches how Croft handles it.
3. **Unmount on close via `showPanel` delay, not via CSS `display:none`.** The exit animation requires the component to stay in the DOM briefly after `isOpen` goes false. A 200ms timeout before setting `showPanel` to false is the right approach. The alternative (`opacity-0 pointer-events-none`) keeps every panel ever opened in the DOM forever.
4. **Escape key handled in `AppContent`.** A single global listener is simpler than each panel wiring its own. The listener is registered when `isOpen` is true and removed when it is false.
5. **`open` and `onOpenChange` props removed from converted components.** They are vestigial once the store drives state. Keeping them would create two competing open/close mechanisms.

---

## What this brief does NOT include

- Per-panel width overrides. All panels are `480px`. If a specific panel genuinely needs more space that is a future change, not part of this brief.
- Resizable panels (drag handle on the left edge of the panel to resize). The architecture supports it — the panel width would move from a fixed class to a JS-controlled inline style with a drag hook, exactly as `ResizableSidebar` works. Out of scope here.
- Panel history or back-navigation within a panel. Not needed for any current panel type.
- Persisting panel state across a hard reload.
- Any new panel type beyond the six conversions above.

---

## Acceptance criteria

- [ ] `pnpm lint` and `pnpm typecheck` are clean with no new errors or warnings
- [ ] `pnpm build` passes
- [ ] All six sheet surfaces open correctly as side panels
- [ ] The main content area smoothly shrinks (200ms ease-out) when any panel opens
- [ ] The panel slides in from the right with a 200ms ease-out transition
- [ ] Closing via the X button runs the exit animation before the panel unmounts
- [ ] Pressing Escape closes the panel with the exit animation
- [ ] On desktop (`lg:` and above), the main content and panel sit side by side
- [ ] On mobile (below `lg:`), the panel takes full width
- [ ] `PersonSheet` opens from the people view add and edit buttons
- [ ] `BulkAdd` opens from the bulk add button in the people view
- [ ] `ContactSheet` opens from the roster add and edit buttons
- [ ] `AddShowPanel` opens from the add show button in shows view and navigates to the new show on success
- [ ] `SendRiderSheet` opens from "Send to venue" in advance documents
- [ ] `AddDayPanel` opens from the add day button in schedule view
- [ ] No shadcn `<Sheet>` is used in any of the six converted files
- [ ] `components/ui/sheet.tsx` is still present and unmodified

---

## Common pitfalls

- Clearing `panel` to `null` immediately on close. The exit animation needs the panel content to stay mounted for 200ms after `isOpen` goes false. Clear `panel` (via `showPanel` going false) after the timeout, not when `close()` is called.
- Percentage panel width. It causes layout instability. Use `lg:w-[480px]`.
- Forgetting to remove `open` and `onOpenChange` from the component interfaces after converting. Leaving them in creates dead props and a misleading interface.
- Putting the Escape listener inside individual panel components. One listener in `AppContent` is correct.
- Passing the callback (e.g. `onSuccess`) as a React node or context value instead of directly in the store descriptor. The descriptor is the right place: it is co-located with the data the panel needs, and the store is not persisted.
- Forgetting that `add-show-panel.tsx` and `add-day-panel.tsx` are new files. The form content that was inline needs to be extracted, not duplicated.
