'use client'

import { X } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'

interface PanelShellProps {
  title: string
  description?: string
  // Renders between the title and the close button — use for a sticky save or primary action.
  headerAction?: React.ReactNode
  children: React.ReactNode
}

export function PanelShell({ title, description, headerAction, children }: PanelShellProps) {
  const { close } = useSidePanel()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 mt-0.5">
          {headerAction}
          <button
            type="button"
            onClick={close}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors ml-1"
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {children}
      </div>
    </div>
  )
}
