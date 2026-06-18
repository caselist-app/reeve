'use client'

import dynamic from 'next/dynamic'
import { ChevronLeft } from 'lucide-react'
import type { AddCategory } from '@/components/schedule/add/add-picker'

// The add forms only render once a category is picked, so each loads on demand
// instead of shipping in the schedule bundle.
const AddFlightForm = dynamic(() => import('@/components/schedule/add/add-flight-form').then((m) => m.AddFlightForm), { ssr: false })
const AddDriveForm = dynamic(() => import('@/components/schedule/add/add-drive-form').then((m) => m.AddDriveForm), { ssr: false })
const AddRailForm = dynamic(() => import('@/components/schedule/add/add-rail-form').then((m) => m.AddRailForm), { ssr: false })
const AddHotelForm = dynamic(() => import('@/components/schedule/add/add-hotel-form').then((m) => m.AddHotelForm), { ssr: false })
const AddShowForm = dynamic(() => import('@/components/schedule/add/add-show-form').then((m) => m.AddShowForm), { ssr: false })
const AddEventForm = dynamic(() => import('@/components/schedule/add/add-event-form').then((m) => m.AddEventForm), { ssr: false })

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
