'use client'

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { AddPicker, type AddCategory } from '@/components/schedule/add/add-picker'
import { AddFlightForm } from '@/components/schedule/add/add-flight-form'
import { AddDriveForm } from '@/components/schedule/add/add-drive-form'
import { AddRailForm } from '@/components/schedule/add/add-rail-form'
import { AddHotelForm } from '@/components/schedule/add/add-hotel-form'
import { AddShowForm } from '@/components/schedule/add/add-show-form'
import { AddEventForm } from '@/components/schedule/add/add-event-form'

interface AddFlowProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
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

export function AddFlow({ tourId, tourDateId, date, timezone, onClose }: AddFlowProps) {
  const [selected, setSelected] = useState<AddCategory | null>(null)

  function handleBack() { setSelected(null) }
  function handleSuccess() { onClose() }

  const formProps = { tourId, tourDateId, date, timezone, onBack: handleBack, onSuccess: handleSuccess }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        {selected ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        ) : (
          <h2 className="text-sm font-semibold">Add to day</h2>
        )}
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
        {!selected ? (
          <AddPicker onSelect={setSelected} />
        ) : (
          <>
            <p className="text-xs font-semibold mb-3">{CATEGORY_TITLES[selected]}</p>
            {selected === 'flight' && <AddFlightForm {...formProps} />}
            {selected === 'drive'  && <AddDriveForm  {...formProps} />}
            {selected === 'rail'   && <AddRailForm   {...formProps} />}
            {selected === 'hotel'  && <AddHotelForm  {...formProps} />}
            {selected === 'show'   && <AddShowForm   tourId={tourId} date={date} onBack={handleBack} onSuccess={handleSuccess} />}
            {selected === 'event'  && <AddEventForm  {...formProps} />}
          </>
        )}
      </div>
    </div>
  )
}
