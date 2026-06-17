'use client'

import { ChevronLeft } from 'lucide-react'
import { AddFlightForm } from '@/components/schedule/add/add-flight-form'
import { AddDriveForm } from '@/components/schedule/add/add-drive-form'
import { AddRailForm } from '@/components/schedule/add/add-rail-form'
import { AddHotelForm } from '@/components/schedule/add/add-hotel-form'
import { AddShowForm } from '@/components/schedule/add/add-show-form'
import { AddEventForm } from '@/components/schedule/add/add-event-form'
import type { AddCategory } from '@/components/schedule/add/add-picker'

interface AddFlowProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  category: AddCategory
  onBack: () => void
  onClose: () => void
}

const CATEGORY_TITLES: Record<AddCategory, string> = {
  flight: 'Add flight',
  drive:  'Add drive',
  rail:   'Add train',
  hotel:  'Add hotel',
  show:   'Add show',
  event:  'Add event',
}

// Renders the form for a pre-selected category. The picker lives in the popover
// in DayViewClient; this component never shows the picker itself.
export function AddFlow({ tourId, tourDateId, date, timezone, category, onBack, onClose }: AddFlowProps) {
  const formProps = { tourId, tourDateId, date, timezone, onBack, onSuccess: onClose }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back
        </button>
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="text-xs font-semibold mb-3">{CATEGORY_TITLES[category]}</p>
        {category === 'flight' && <AddFlightForm {...formProps} />}
        {category === 'drive'  && <AddDriveForm  {...formProps} />}
        {category === 'rail'   && <AddRailForm   {...formProps} />}
        {category === 'hotel'  && <AddHotelForm  {...formProps} />}
        {category === 'show'   && <AddShowForm   tourId={tourId} date={date} onBack={onBack} onSuccess={onClose} />}
        {category === 'event'  && <AddEventForm  {...formProps} />}
      </div>
    </div>
  )
}
