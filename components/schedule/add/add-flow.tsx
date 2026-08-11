'use client'

import dynamic from 'next/dynamic'
import { PanelShell } from '@/components/layout/panel-shell'
import { useSidePanel } from '@/stores/side-panel-store'

// The six categories the add-to-day panel can render. flight/drive/rail/hotel
// are reached from the day-form's Book rows (REE-89 deleted the standalone
// category picker); show and event stay for the venue block and any other
// add-to-day caller. Kept in step with ScheduleAddCategory in side-panel-store.
export type AddCategory = 'flight' | 'drive' | 'rail' | 'hotel' | 'show' | 'event'

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
  show:   'Add show',
  event:  'Add event',
}

// Renders the form for a pre-selected category, on PanelShell like every
// other schedule panel. The picker itself lives in the popover/sheet in
// DayViewClient; this component never shows it.
export function AddFlow({ tourId, tourDateId, date, timezone, category, onBack }: AddFlowProps) {
  const { close } = useSidePanel()
  const formProps = { tourId, tourDateId, date, timezone, onBack, onSuccess: close }

  return (
    <PanelShell title={CATEGORY_TITLES[category]}>
      {category === 'flight' && <AddFlightForm {...formProps} />}
      {category === 'drive'  && <AddDriveForm  {...formProps} />}
      {category === 'rail'   && <AddRailForm   {...formProps} />}
      {category === 'hotel'  && <AddHotelForm  {...formProps} />}
      {category === 'show'   && <AddShowForm   tourId={tourId} date={date} onBack={onBack} onSuccess={close} />}
      {category === 'event'  && <AddEventForm  {...formProps} />}
    </PanelShell>
  )
}
