'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DayTypePicker, type DayTypeOption } from '@/components/schedule/add/day-type-picker'

export function AddDayButton({ tourId }: { tourId: string }) {
  const { open } = useSidePanel()
  const [popoverOpen, setPopoverOpen] = useState(false)

  function handleSelect(dayType: DayTypeOption) {
    setPopoverOpen(false)
    open({ type: 'add-day', tourId, initialDayType: dayType })
  }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Add day"
          title="Add day"
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Add day
        </p>
        {/* Mount picker only while open so keyboard listeners are scoped to this state. */}
        {popoverOpen && <DayTypePicker onSelect={handleSelect} />}
      </PopoverContent>
    </Popover>
  )
}
