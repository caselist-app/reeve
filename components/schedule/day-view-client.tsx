'use client'

import type { ReactNode } from 'react'
import { useSchedulePanel } from '@/stores/schedule-panel-store'

interface DayViewClientProps {
  // Server Component output passed as slots.
  timeline: ReactNode
  dayInfoPanel: ReactNode
}

// State shell for the schedule day view. Holds which timeline card is active
// and swaps the right column between the day info panel and the edit panel.
// Only this component is a client component; the slots remain Server Components.
export function DayViewClient({ timeline, dayInfoPanel }: DayViewClientProps) {
  const { activeCard, setActiveCard } = useSchedulePanel()

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Timeline: flex-1 */}
      <div className="flex-1 min-w-0 overflow-y-auto border-r border-border">
        {timeline}
      </div>

      {/* Right panel: 260px fixed */}
      <div className="w-[260px] shrink-0 overflow-y-auto">
        {activeCard ? (
          // Edit panel placeholder -- replaced by Commit 4 with real panels.
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <span className="text-sm font-semibold capitalize">{activeCard.type.replace('-', ' ')}</span>
              <button
                onClick={() => setActiveCard(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="Close panel"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          dayInfoPanel
        )}
      </div>
    </div>
  )
}
