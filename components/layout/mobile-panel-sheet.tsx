'use client'

import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'

interface MobilePanelSheetProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

// The Radix Sheet chrome for AppContent's mobile side-panel overlay, split
// out so app-content.tsx can load it through next/dynamic (REE-267) instead
// of shipping @radix-ui/react-dialog in the app shell bundle.
export function MobilePanelSheet({ isOpen, onOpenChange, children }: MobilePanelSheetProps) {
  return (
    <SheetPrimitive.Root open={isOpen} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-full max-w-sm flex flex-col',
            'bg-background border-l border-border',
            'pt-[var(--safe-top)] pb-[var(--safe-bottom)]',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
            'duration-200',
          )}
        >
          <SheetPrimitive.Title className="sr-only">Panel</SheetPrimitive.Title>
          {children}
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  )
}
