'use client'

import { cn } from '@/lib/utils'
import { useSidebarWidth } from '@/hooks/use-sidebar-width'
import { Sidebar } from '@/components/nav/sidebar'

interface Tour {
  id: string
  name: string
  artist_id: string
  artist_name: string
}

interface ResizableSidebarProps {
  tours: Tour[]
  initialWidth: number
  lastTourId?: string | null
}

export function ResizableSidebar({ tours, initialWidth, lastTourId = null }: ResizableSidebarProps) {
  const { width, isDragging, onDragStart } = useSidebarWidth(initialWidth)

  return (
    <div className="relative flex-shrink-0" style={{ width }}>
      <Sidebar tours={tours} lastTourId={lastTourId} />

      {/* Drag handle on the right edge */}
      <div
        onMouseDown={onDragStart}
        className={cn(
          'absolute top-0 right-0 h-full w-1 cursor-col-resize z-50 transition-colors',
          isDragging ? 'bg-sidebar-border/60' : 'hover:bg-sidebar-border/40',
        )}
        aria-hidden
      />
    </div>
  )
}
