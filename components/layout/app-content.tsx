'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { ActivePanel } from '@/components/layout/active-panel'

interface AppContentProps {
  children: React.ReactNode
}

export function AppContent({ children }: AppContentProps) {
  const { isOpen, close } = useSidePanel()

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

      {/* Side panel */}
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
