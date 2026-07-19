'use client'

import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidebarWidth } from '@/hooks/use-sidebar-width'
import { useSidebarCollapsed } from '@/hooks/use-sidebar-collapsed'
import { Sidebar } from '@/components/nav/sidebar'

const COLLAPSED_WIDTH = 64

interface Tour {
  id: string
  name: string
  artist_id: string
  artist_name: string
}

interface ResizableSidebarProps {
  tours: Tour[]
  initialWidth: number
  initialCollapsed: boolean
  lastTourId?: string | null
}

export function ResizableSidebar({ tours, initialWidth, initialCollapsed, lastTourId = null }: ResizableSidebarProps) {
  const { collapsed, setCollapsed, toggleCollapsed } = useSidebarCollapsed(initialCollapsed)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // If the rail is collapsed while the settings overlay is open, close the
  // overlay. The overlay is absolute inset-0 and can't render its full-text
  // nav at 64px; closing it is the correct recovery in all cases (chevron
  // click, Cmd+B, or any future collapse trigger).
  useEffect(() => {
    if (collapsed && settingsOpen) {
      setSettingsOpen(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])

  // The settings overlay (TourSettingsPanel) is absolute inset-0 inside the
  // rail and can't render its full-text nav at 64px. Sidebar's openSettings()
  // already force-expands before opening, but that only covers the initial
  // click; the useEffect above covers the case where collapse is toggled
  // while the overlay is already open.
  const effectiveCollapsed = collapsed && !settingsOpen

  const { width, isDragging, onDragStart } = useSidebarWidth(initialWidth, effectiveCollapsed)

  // Cmd+B / Ctrl+B toggles collapse, unless focus is inside a text field,
  // where Cmd+B is reserved for bold formatting (schedule notes editor), or
  // the settings overlay is open, where toggling wouldn't be visible until
  // close anyway (see effectiveCollapsed) and would just be confusing.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        if (settingsOpen) return
        const active = document.activeElement
        const isTyping =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable)
        if (isTyping) return
        e.preventDefault()
        toggleCollapsed()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [toggleCollapsed, settingsOpen])

  return (
    <div
      className={cn('relative flex-shrink-0 group/rail', !isDragging && 'transition-[width] duration-200 ease-in-out')}
      style={{ width: effectiveCollapsed ? COLLAPSED_WIDTH : width }}
    >
      <Sidebar
        tours={tours}
        lastTourId={lastTourId}
        collapsed={effectiveCollapsed}
        setCollapsed={setCollapsed}
        settingsOpen={settingsOpen}
        onSettingsOpenChange={setSettingsOpen}
      />

      {/* Drag handle on the right edge. Mouse-only; hidden on touch and while collapsed. */}
      {!effectiveCollapsed && (
        <div
          onMouseDown={onDragStart}
          className={cn(
            'absolute top-0 right-0 h-full w-1 cursor-col-resize z-50 transition-colors hidden md:block',
            isDragging ? 'bg-sidebar-border/60' : 'hover:bg-sidebar-border/40',
          )}
          aria-hidden
        />
      )}

      {/* Collapse toggle chevron: hover-only on the handle when expanded, always
          visible when collapsed since there's no other way back to expanded.
          Hidden entirely while the settings overlay is open, since the rail
          can't visually collapse right now regardless of what's clicked. */}
      {!settingsOpen && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            toggleCollapsed()
          }}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 z-50 h-7 w-7 items-center justify-center rounded-full border shadow-sm transition-opacity hidden md:flex',
            'bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent',
            collapsed ? 'opacity-100' : 'opacity-0 group-hover/rail:opacity-100',
          )}
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      )}
    </div>
  )
}
