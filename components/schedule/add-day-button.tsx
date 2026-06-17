'use client'

import { Plus } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'

// Secondary affordance in the date spine header. Tour dates are mostly set
// once, so this stays quiet and out of the way of the timeline "+ Add" action.
export function AddDayButton({ tourId }: { tourId: string }) {
  const { open } = useSidePanel()

  return (
    <button
      type="button"
      onClick={() => open({ type: 'add-day', tourId })}
      aria-label="Add day"
      title="Add day"
      className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
    >
      <Plus className="h-4 w-4" />
    </button>
  )
}
