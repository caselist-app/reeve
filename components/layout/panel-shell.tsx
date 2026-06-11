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
