'use client'

import { useState, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { useSchedulePanel } from '@/stores/schedule-panel-store'
import { ShowPanel } from '@/components/schedule/panels/show-panel'
import { TransportPanel } from '@/components/schedule/panels/transport-panel'
import { HotelPanel } from '@/components/schedule/panels/hotel-panel'
import { EventPanel } from '@/components/schedule/panels/event-panel'
import { AddFlow } from '@/components/schedule/add/add-flow'
import { AddPicker, type AddCategory } from '@/components/schedule/add/add-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Tables } from '@/lib/types/database'

// Serializable panel data passed from the Server Component page.
// Avoids re-fetching when a card is clicked.
export interface DayPanelData {
  shows: Array<{
    id: string
    venue_name: string
    day_sheets: Pick<
      Tables<'day_sheets'>,
      | 'venue_access' | 'load_in' | 'line_check' | 'soundcheck' | 'vip'
      | 'doors' | 'support_on' | 'support_off' | 'changeover'
      | 'headliner_on' | 'headliner_off' | 'curfew' | 'load_out' | 'hotel_departure'
    > | null
  }>
  segments: Array<Pick<
    Tables<'transport_segments'>,
    | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
    | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
  >>
  hotels: Array<Pick<
    Tables<'hotel_stays'>,
    | 'id' | 'name' | 'address'
    | 'check_in_date' | 'check_in_time'
    | 'check_out_date' | 'check_out_time'
    | 'wifi_network' | 'wifi_password'
  >>
  events: Array<Pick<
    Tables<'day_events'>,
    'id' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
  >>
  timezone: string
}

interface DayViewClientProps {
  timeline: ReactNode
  dayInfoPanel: ReactNode
  panelData: DayPanelData
  // Context needed for the add flow forms.
  addContext: { tourId: string; tourDateId: string; date: string; timezone: string }
}

// State shell for the schedule day view. Holds which timeline card is active
// and swaps the right column between the day info panel and the edit panel.
// Only this component is a client component; the slots remain Server Components.
export function DayViewClient({ timeline, dayInfoPanel, panelData, addContext }: DayViewClientProps) {
  const { activeCard, setActiveCard } = useSchedulePanel()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<AddCategory | null>(null)

  function renderEditPanel() {
    if (!activeCard) return null

    switch (activeCard.type) {
      case 'show': {
        const show = panelData.shows.find((s) => s.id === activeCard.showId)
        if (!show) return null
        return (
          <ShowPanel
            showId={show.id}
            venueName={show.venue_name}
            timezone={panelData.timezone}
            daySheet={show.day_sheets}
          />
        )
      }
      case 'transport': {
        const seg = panelData.segments.find((s) => s.id === activeCard.segmentId)
        if (!seg) return null
        return <TransportPanel segment={seg} timezone={panelData.timezone} />
      }
      case 'hotel-checkin':
      case 'hotel-checkout': {
        const stay = panelData.hotels.find((h) => h.id === activeCard.stayId)
        if (!stay) return null
        return <HotelPanel stay={stay} />
      }
      case 'event': {
        const ev = panelData.events.find((e) => e.id === activeCard.eventId)
        if (!ev) return null
        return <EventPanel event={ev} timezone={panelData.timezone} />
      }
    }
  }

  const editPanel = renderEditPanel()

  function handleCategorySelect(category: AddCategory) {
    setPopoverOpen(false)
    setActiveCard(null)
    setSelectedCategory(category)
  }

  // Back from the form re-opens the popover so the user can pick a different type.
  function handleAddBack() {
    setSelectedCategory(null)
    setPopoverOpen(true)
  }

  function handleAddClose() {
    setSelectedCategory(null)
  }

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Timeline: flex-1 */}
      <div className="relative flex flex-col flex-1 min-w-0">
        {/* Add-to-day: opens a popover picker rather than taking over the right panel. */}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Add to day"
              title="Add to day"
              className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-foreground transition-colors hover:bg-muted/70"
            >
              <Plus className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Add to day
            </p>
            <AddPicker onSelect={handleCategorySelect} />
          </PopoverContent>
        </Popover>
        <div className="flex-1 overflow-y-auto border-r border-border">
          {timeline}
        </div>
      </div>

      {/* Right panel: 260px fixed */}
      <div className="w-[260px] shrink-0 overflow-y-auto">
        {selectedCategory ? (
          <AddFlow
            {...addContext}
            category={selectedCategory}
            onBack={handleAddBack}
            onClose={handleAddClose}
          />
        ) : (
          editPanel ?? dayInfoPanel
        )}
      </div>
    </div>
  )
}
