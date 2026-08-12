'use client'

import dynamic from 'next/dynamic'
import { PanelShell } from '@/components/layout/panel-shell'
import { useSidePanel } from '@/stores/side-panel-store'

// The four categories the add-to-day panel can render, one per dedicated add
// form. flight/drive/rail/hotel are the things with structure beyond a time; the
// day form (buildAddOptions) hands them here from its Book rows. Show and event
// left this list (REE-90): a show rewrites the day's type, so it is a day-type
// decision reached from the venue block, and an event is just a custom day_items
// row typed into the day form. Kept in step with ScheduleAddCategory in
// side-panel-store.
export type AddCategory = 'flight' | 'drive' | 'rail' | 'hotel'

// The add forms only render once a category is picked, so each loads on demand
// instead of shipping in the schedule bundle.
const AddFlightForm = dynamic(() => import('@/components/schedule/add/add-flight-form').then((m) => m.AddFlightForm), { ssr: false })
const AddDriveForm = dynamic(() => import('@/components/schedule/add/add-drive-form').then((m) => m.AddDriveForm), { ssr: false })
const AddRailForm = dynamic(() => import('@/components/schedule/add/add-rail-form').then((m) => m.AddRailForm), { ssr: false })
const AddHotelForm = dynamic(() => import('@/components/schedule/add/add-hotel-form').then((m) => m.AddHotelForm), { ssr: false })

interface AddFlowProps {
  tourId: string
  tourDateId: string
  date: string
  timezone: string
  category: AddCategory
  // The wall-clock time the TM selected on the day, 'HH:MM' in the tour zone,
  // carried from the day form (REE-140). Seeds the book form's departure or
  // check-in default. Absent when the line carried no time.
  initialClock?: string
  // Leaves this form and reopens the category picker. Supplied by the
  // side panel descriptor, since that has to coordinate with the popover
  // or bottom-sheet state day-view-client.tsx owns.
  onBack: () => void
}

const CATEGORY_TITLES: Record<AddCategory, string> = {
  flight: 'Add flight',
  drive:  'Add drive',
  rail:   'Add train',
  hotel:  'Add hotel',
}

// Renders the form for a pre-selected category, on PanelShell like every
// other schedule panel. The picker itself lives in the popover/sheet in
// DayViewClient; this component never shows it.
export function AddFlow({ tourId, tourDateId, date, timezone, category, initialClock, onBack }: AddFlowProps) {
  const { close } = useSidePanel()
  const formProps = { tourId, tourDateId, date, timezone, initialClock, onBack, onSuccess: close }

  return (
    <PanelShell title={CATEGORY_TITLES[category]}>
      {category === 'flight' && <AddFlightForm {...formProps} />}
      {category === 'drive'  && <AddDriveForm  {...formProps} />}
      {category === 'rail'   && <AddRailForm   {...formProps} />}
      {category === 'hotel'  && <AddHotelForm  {...formProps} />}
    </PanelShell>
  )
}
