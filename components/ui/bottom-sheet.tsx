'use client'

// Shared mobile bottom-sheet chrome, wrapping @radix-ui/react-dialog
// directly (not shadcn's Sheet/Drawer/Dialog, per CLAUDE.md/COMPONENTS.md).
// Brief 32 Phase 4: day-view-client.tsx inlined this same ~200 character
// SheetPrimitive.Content className twice, varying only in whether the
// caller supplies its own visible header row (with a close button) or just
// a plain label.
//
// This is deliberately scoped to bottom-anchored sheets only. app-content.tsx
// (mobile global panel, slides in from the right) and mobile-nav-drawer.tsx
// (slides in from the left) also wrap @radix-ui/react-dialog, but they are a
// different UI pattern (edge drawers, not bottom sheets) and each is a
// single, non-duplicated instance in its own file: forcing them through this
// component would be the same false abstraction the brief itself warns
// against for command-palette.tsx's centred modal. Leave them as they are.

import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Radix requires an accessible Title in the tree regardless of whether the
  // caller renders its own visible heading.
  title: string
  // Class for the Title element itself. Pass 'sr-only' when children render
  // a custom visible header (e.g. a title + action row with a close
  // button); otherwise defaults to the plain uppercase label style used by
  // sheets with no custom header.
  titleClassName?: string
  // Only the max-height actually varies between the two current call sites,
  // and both happen to use the same value today - kept as a prop so a future
  // sheet with more content doesn't have to hand-roll the wrapper again.
  maxHeight?: string
  children: ReactNode
}

export function BottomSheet({
  open,
  onOpenChange,
  title,
  titleClassName,
  maxHeight = '80dvh',
  children,
}: BottomSheetProps) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-xl border-t border-border bg-background pb-[env(safe-area-inset-bottom)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom duration-300"
          style={{ maxHeight }}
        >
          <SheetPrimitive.Title
            className={cn(
              titleClassName ?? 'px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
            )}
          >
            {title}
          </SheetPrimitive.Title>
          {children}
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}

// Re-exported so call sites that need the close affordance inside a custom
// header (see day-view-client.tsx's day-info sheet) don't need their own
// import of the raw Radix module just for this one piece.
export const BottomSheetClose = SheetPrimitive.Close
