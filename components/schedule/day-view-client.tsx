'use client'

import type { ReactNode } from 'react'
import { useSchedulePanel } from '@/stores/schedule-panel-store'
import { ShowPanel } from '@/components/schedule/panels/show-panel'
import { TransportPanel } from '@/components/schedule/panels/transport-panel'
import { HotelPanel } from '@/components/schedule/panels/hotel-panel'
import { EventPanel } from '@/components/schedule/panels/event-panel'
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
}

// State shell for the schedule day view. Holds which timeline card is active
// and swaps the right column between the day info panel and the edit panel.
// Only this component is a client component; the slots remain Server Components.
export function DayViewClient({ timeline, dayInfoPanel, panelData }: DayViewClientProps) {
  const { activeCard, setActiveCard } = useSchedulePanel()

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

  return (
    <div className="flex flex-1 min-w-0 min-h-0">
      {/* Timeline: flex-1 */}
      <div className="flex-1 min-w-0 overflow-y-auto border-r border-border">
        {timeline}
      </div>

      {/* Right panel: 260px fixed */}
      <div className="w-[260px] shrink-0 overflow-y-auto">
        {editPanel ?? dayInfoPanel}
      </div>
    </div>
  )
}
