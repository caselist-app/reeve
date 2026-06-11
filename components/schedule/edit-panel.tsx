'use client'

import { X } from 'lucide-react'
import { useSchedulePanel } from '@/stores/schedule-panel-store'

interface EditPanelProps {
  title: string
  subtitle?: string
  children: React.ReactNode
}

// Shared outer shell for the right-column edit panel. Not a Sheet or Drawer:
// it is a fixed column within the schedule layout, not a floating overlay.
export function EditPanel({ title, subtitle, children }: EditPanelProps) {
  const { setActiveCard } = useSchedulePanel()

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setActiveCard(null)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5"
          aria-label="Close panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {children}
      </div>
    </div>
  )
}
