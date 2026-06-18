'use client'

import { useState, useEffect } from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { ActivePanel } from '@/components/layout/active-panel'
import { useIsMobile } from '@/hooks/use-is-mobile'

interface AppContentProps {
  children: React.ReactNode
}

export function AppContent({ children }: AppContentProps) {
  const { isOpen, close } = useSidePanel()
  const isMobile = useIsMobile()

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

  // Escape key closes the panel.
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

  const panelContent = showPanel ? (
    <div
      className={cn(
        'h-full bg-background border border-border rounded-3xl overflow-hidden transition-transform duration-200 ease-out',
        isOpen ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      <ActivePanel />
    </div>
  ) : null

  // Below md: render as a fixed full-height overlay using Sheet primitives
  // so the main content is never hidden behind the panel.
  if (isMobile) {
    return (
      <div className="flex flex-1 min-h-0 overflow-hidden py-2 pr-2">
        <main className="flex-1 min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden">
          {children}
        </main>

        <SheetPrimitive.Root open={isOpen} onOpenChange={(open) => { if (!open) close() }}>
          <SheetPrimitive.Portal>
            <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <SheetPrimitive.Content
              className={cn(
                'fixed inset-y-0 right-0 z-50 w-full max-w-sm',
                'bg-background border-l border-border',
                'data-[state=open]:animate-in data-[state=closed]:animate-out',
                'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
                'duration-200',
              )}
            >
              <SheetPrimitive.Title className="sr-only">Panel</SheetPrimitive.Title>
              {panelContent}
            </SheetPrimitive.Content>
          </SheetPrimitive.Portal>
        </SheetPrimitive.Root>
      </div>
    )
  }

  // md and above: inline panel that shrinks the main content area.
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

      {/* Inline side panel at lg+, full-width takeover at md-lg */}
      <div
        className={cn(
          'flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
          isOpen ? 'lg:w-[480px] w-full' : 'w-0',
        )}
      >
        {panelContent}
      </div>
    </div>
  )
}
