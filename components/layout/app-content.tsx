'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { ActivePanel } from '@/components/layout/active-panel'
import { MobileTopBar } from '@/components/layout/mobile-top-bar'
import { useIsMobile } from '@/hooks/use-is-mobile'
import { hasSecondaryPanel } from '@/lib/layout/secondary-panel-routes'

// Keeps @radix-ui/react-dialog out of the app shell bundle (REE-267): the
// mobile Sheet chrome only loads once the side panel has actually opened.
const MobilePanelSheet = dynamic(
  () => import('@/components/layout/mobile-panel-sheet').then((mod) => mod.MobilePanelSheet),
  { ssr: false },
)

interface AppContentProps {
  children: React.ReactNode
  // Route-supplied standalone panel (e.g. the schedule Dates list), rendered
  // as its own card to the left of main. null on routes that don't use it.
  secondaryPanel?: React.ReactNode
}

export function AppContent({ children, secondaryPanel }: AppContentProps) {
  const { isOpen, close } = useSidePanel()
  const isMobile = useIsMobile()
  const pathname = usePathname()
  // Deterministic visibility gate: see lib/layout/secondary-panel-routes.ts
  // for why pathname, not just the secondaryPanel prop, decides this.
  const showSecondaryPanel = Boolean(secondaryPanel) && hasSecondaryPanel(pathname)

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

  // Gates the dynamic import of MobilePanelSheet: stays false (so the Radix
  // Sheet chrome never loads) until the side panel has opened at least once.
  const [hasOpenedPanel, setHasOpenedPanel] = useState(false)

  useEffect(() => {
    if (isOpen) setHasOpenedPanel(true)
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

  // Below md: top bar + main content stacked vertically, panel as fixed overlay.
  if (isMobile) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <MobileTopBar />

        <div className="flex flex-1 min-h-0 overflow-hidden px-2 pt-2 pb-[max(0.5rem,var(--safe-bottom))]">
          {/* flex flex-col, not a bare block: the day view's inner flex-1/min-h-0
              chain (day-view-client -> day-calendar -> RBC's .rbc-time-content)
              only bounds to a real height if its parent is a flex container.
              As a plain block main, that chain never bounded, so the whole grid
              expanded to full height and main became the sole scroll container.
              Desktop tolerated that (the wheel scrolls main either way), but on
              iOS the nested, non-scrollable overflow-y:auto wrappers trapped the
              touch and never bubbled the scroll to main, so the day view simply
              would not scroll (REE-125). Making main a flex column bounds the
              chain so RBC scrolls internally instead. Ordinary pages render a
              plain child that overflows and main still scrolls them. */}
          <main className="flex flex-col flex-1 min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>

        {hasOpenedPanel && (
          <MobilePanelSheet isOpen={isOpen} onOpenChange={(open) => { if (!open) close() }}>
            {panelContent}
          </MobilePanelSheet>
        )}
      </div>
    )
  }

  // md and above: inline panel that shrinks the main content area.
  //
  // The gap between main and each side card is a margin on that card, not a
  // shared `gap-*` utility on the row. A single gap utility applies uniformly
  // between every pair of flex children, so gating it on
  // `showPanel || showSecondaryPanel` put an 8px gap next to the side panel
  // container even while it was closed (w-0), purely because a secondary
  // panel happened to be present on the route. Margins let each side's
  // spacing depend only on its own visibility.
  return (
    <div
      className={cn(
        'flex flex-1 py-2 pr-2 min-h-0 overflow-hidden transition-[padding] duration-200 ease-out',
        showSecondaryPanel ? 'pl-2' : 'pl-0',
      )}
    >
      {/* Secondary panel: route-supplied, always-visible card (e.g. schedule
          Dates). Hidden below lg, same breakpoint the schedule route already
          uses to swap the sidebar for the horizontal date strip. Gated on
          pathname, not just the prop, see showSecondaryPanel above. */}
      {showSecondaryPanel && (
        <div className="hidden lg:flex w-[230px] shrink-0 h-full flex-col bg-background border border-border rounded-3xl overflow-hidden mr-2">
          {secondaryPanel}
        </div>
      )}

      <main
        className={cn(
          'min-w-0 bg-background border border-border rounded-3xl overflow-y-auto overflow-x-hidden transition-[flex] duration-200 ease-out',
          isOpen ? 'lg:flex-1 w-0' : 'flex-1',
        )}
      >
        {children}
      </main>

      {/* Inline side panel at lg+, full-width takeover at md-lg. Always mounted (even at w-0) so the width transition has a starting value to animate from; its own left margin (not a row gap) is what's gated on isOpen. */}
      <div
        className={cn(
          'flex-shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-out',
          isOpen ? 'lg:w-[480px] w-full ml-2' : 'w-0 ml-0',
        )}
      >
        {panelContent}
      </div>
    </div>
  )
}
