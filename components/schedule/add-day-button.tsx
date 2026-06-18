'use client'

import { useState } from 'react'
import { Plus, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSidePanel } from '@/stores/side-panel-store'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DayTypePicker, type DayTypeOption } from '@/components/schedule/add/day-type-picker'

interface AddDayButtonProps {
  tourId: string
  // Override the trigger glyph (e.g. CalendarPlus on the mobile date strip).
  icon?: LucideIcon
  // Override the trigger styling, e.g. a larger touch target on mobile.
  triggerClassName?: string
  align?: 'start' | 'center' | 'end'
}

export function AddDayButton({ tourId, icon: Icon = Plus, triggerClassName, align = 'end' }: AddDayButtonProps) {
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
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground',
            triggerClassName,
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-56 p-2">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Add day
        </p>
        {/* Mount picker only while open so keyboard listeners are scoped to this state. */}
        {popoverOpen && <DayTypePicker onSelect={handleSelect} />}
      </PopoverContent>
    </Popover>
  )
}
