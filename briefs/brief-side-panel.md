# SUPERSEDED — see brief 22-side-panel.md

**Status:** Ready to build  
**Reference:** `/Users/mattstevenson/Documents/croft/components/layout/app-content.tsx` and `stores/email-side-panel-store.ts`

---

## What this is

Every shadcn `<Sheet>` in the app gets replaced with a persistent side panel that slides in from the right as a card — the same `rounded-3xl border border-border bg-background` style as the main content area. The main content area shrinks to make room; there is no overlay, no backdrop, no full-screen takeover.

This is the exact pattern from Croft. Port it faithfully.

The panel is also the foundation for future panels (show detail, schedule day, transport segment, etc.), so build it generically and cleanly.

---

## Sheets being replaced

Six sheet usages across the app, all `side="right"` by default:

| Component | Title | Width |
|---|---|---|
| `components/people/person-sheet.tsx` | Add / Edit person | `sm:max-w-lg` |
| `components/people/bulk-add.tsx` | Bulk add crew | `sm:max-w-md` |
| `components/roster/contact-sheet.tsx` | New / Edit contact | `sm:max-w-lg` |
| `components/shows/shows-view.tsx` | Add show | `sm:max-w-lg` |
| `components/shows/send-rider-sheet.tsx` | Send advance | default |
| `components/schedule/schedule-view.tsx` | Add day | `sm:max-w-lg` |

All six get converted. No new shadcn Sheet usage is introduced anywhere.

---

## What to build

### 1. Zustand store — `stores/side-panel-store.ts`

A single store controls which panel is open. Use a discriminated union so TypeScript knows the props for each panel type.

```ts
type PanelState =
  | { type: null }
  | { type: 'person'; tourId: string; personId: string | null }
  | { type: 'bulk-add'; tourId: string }
  | { type: 'contact'; tourId: string; contactId: string | null }
  | { type: 'add-show'; tourId: string; defaultDate?: string }
  | { type: 'send-rider'; tourId: string; showId: string; departmentLabel: string; documents: SendableDocument[]; people: ContactablePerson[] }
  | { type: 'add-day'; tourId: string; defaultDate?: string }
```

The store exposes:
- `panel: PanelState` — current panel (null = closed)
- `open(panel: PanelState): void`
- `close(): void`

No history, no scroll restoration needed at this stage. Keep it minimal.

Import the types for `SendableDocument` and `ContactablePerson` from their existing locations in `components/shows/send-rider-sheet.tsx`.

### 2. Layout container — `components/layout/app-content.tsx`

Port directly from Croft's `app-content.tsx`. The structure:

```tsx
<div className="flex flex-1 gap-2 py-2 pr-2 min-h-0 overflow-hidden">
  <main
    className={cn(
      'min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden transition-[flex] duration-200 ease-out',
      panelOpen ? 'lg:flex-1 w-0' : 'flex-1',
    )}
  >
    {children}
  </main>

  {/* Side panel */}
  <div
    className={cn(
      'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
      panelOpen ? 'lg:w-[480px] w-full' : 'w-0',
    )}
  >
    {showPanel && (
      <div
        className={cn(
          'h-full bg-background border border-border rounded-3xl overflow-hidden transition-transform duration-200 ease-out',
          panelOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <ActivePanel />
      </div>
    )}
  </div>
</div>
```

Keep the panel in the DOM for 200ms after close so the exit animation completes before unmounting (same pattern as Croft — `useEffect` with `setTimeout`).

`ActivePanel` is a switch on `panel.type` that renders the right content component (see section 4).

The default panel width is `lg:w-[480px]`. Do not use a percentage — a fixed width means the main content area doesn't jump around as the panel opens. On mobile it goes full width (`w-full`).

### 3. Wire into the app layout — `app/(app)/layout.tsx`

Replace the current `<div className="flex flex-1 gap-2 py-2 pr-2 ...">` wrapper and `<main>` with `<AppContent>`. The `ResizableSidebar` stays untouched to the left of it.

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

`AppContent` is a Client Component (it reads the Zustand store). The layout file itself stays a Server Component.

### 4. Panel content components

Each existing sheet component keeps all its internal form logic unchanged. Only the outer `<Sheet>` wrapper is removed. The content becomes a plain `<div>` with a standard panel chrome: close button in the top-right corner, title, scrollable body.

Create a shared panel chrome wrapper — `components/layout/panel-shell.tsx`:

```tsx
interface PanelShellProps {
  title: string
  children: React.ReactNode
}

export function PanelShell({ title, children }: PanelShellProps) {
  const { close } = useSidePanel()
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-4 shrink-0 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button onClick={close} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
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

Each converted sheet wraps its content in `<PanelShell title="...">` and calls `useSidePanel().close()` on success instead of calling `onOpenChange(false)`.

### 5. Open triggers

Wherever a sheet is currently opened via local `useState` (e.g. `setAddOpen(true)`), replace with `useSidePanel().open({ type: 'add-show', tourId, ... })`.

The `onOpenChange` prop on sheet components can be removed once the store drives open/close state. Components that currently receive `open` and `onOpenChange` as props should be refactored to read from the store directly.

---

## Callbacks after action

Some panels fire a callback on success (e.g. `onSent` in send-rider, `onAdded` in person-sheet). These currently update parent state. After the conversion:

- If the callback causes a data refresh, use `router.refresh()` from `next/navigation` inside the panel component instead of the callback. This is cleaner and removes prop coupling.
- If the callback does something more specific (e.g. optimistic UI update in `advance-documents.tsx`), keep the callback but pass it through the store as a stable ref: `onSuccess?: () => void` field in the panel state union, assigned when `open()` is called.

---

## What does NOT change

- The form logic, field layout, and validation inside each sheet component.
- The `send-rider-sheet` `SendRiderSheet` internal structure (just unwrap the `<Sheet>`).
- The `person-sheet` `PersonSheet` internal structure (just unwrap the `<Sheet>`).
- `CommandPalette` — not a sheet, not touched.
- The `ResizableSidebar` — not touched.
- `components/ui/sheet.tsx` — leave the file in place (shadcn primitive, might be used elsewhere or in future). Just stop using it in the six files above.

---

## File checklist

New files:
- `stores/side-panel-store.ts`
- `components/layout/app-content.tsx`
- `components/layout/panel-shell.tsx`

Modified files:
- `app/(app)/layout.tsx` — swap wrapper for `<AppContent>`
- `components/people/person-sheet.tsx` — remove Sheet wrapper, use PanelShell, read store
- `components/people/bulk-add.tsx` — same
- `components/roster/contact-sheet.tsx` — same
- `components/shows/shows-view.tsx` — open via store instead of local state
- `components/shows/send-rider-sheet.tsx` — remove Sheet wrapper, use PanelShell, read store
- `components/schedule/schedule-view.tsx` — open via store instead of local state

---

## Definition of done

- `pnpm lint` and `pnpm typecheck` are clean.
- All six sheet surfaces open and close correctly as side panels.
- The main content area smoothly shrinks when any panel opens.
- The panel slides in from the right with a 200ms ease-out transition.
- Closing the panel (X button or Escape key) runs the exit animation before unmounting.
- On mobile, the panel takes full width.
- No shadcn `<Sheet>` is used in any of the six converted files.
- The panel container is in place and ready to accept future panel types by adding a new entry to the discriminated union.
