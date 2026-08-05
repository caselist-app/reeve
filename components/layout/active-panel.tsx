'use client'

import dynamic from 'next/dynamic'
import { useSidePanel } from '@/stores/side-panel-store'

// Each panel is loaded on demand the first time it opens, rather than shipping
// in the initial bundle on every page. They only ever render after a user
// action, so client-only loading (ssr: false) costs nothing in UX.
const BulkAdd = dynamic(() => import('@/components/people/bulk-add').then((m) => m.BulkAdd), { ssr: false })
const AddPersonPanel = dynamic(() => import('@/components/people/add-person-panel').then((m) => m.AddPersonPanel), { ssr: false })
const ContactSheet = dynamic(() => import('@/components/roster/contact-sheet').then((m) => m.ContactSheet), { ssr: false })
const ContactPanel = dynamic(() => import('@/components/roster/contact-panel').then((m) => m.ContactPanel), { ssr: false })
const SendRiderSheet = dynamic(() => import('@/components/shows/send-rider-sheet').then((m) => m.SendRiderSheet), { ssr: false })
const VenuePanel = dynamic(() => import('@/components/schedule/panels/venue-panel').then((m) => m.VenuePanel), { ssr: false })
const AdvancePanel = dynamic(() => import('@/components/schedule/panels/advance-panel').then((m) => m.AdvancePanel), { ssr: false })
const AddDayPanel = dynamic(() => import('@/components/schedule/add-day-panel').then((m) => m.AddDayPanel), { ssr: false })
// Brief 33: schedule day view detail and add panels.
// Brief 42: the show panel and the event panel are one day-item panel now.
const DayItemPanel = dynamic(() => import('@/components/schedule/panels/day-item-panel').then((m) => m.DayItemPanel), { ssr: false })
const TransportPanel = dynamic(() => import('@/components/schedule/panels/transport-panel').then((m) => m.TransportPanel), { ssr: false })
const HotelPanel = dynamic(() => import('@/components/schedule/panels/hotel-panel').then((m) => m.HotelPanel), { ssr: false })
const AddFlow = dynamic(() => import('@/components/schedule/add/add-flow').then((m) => m.AddFlow), { ssr: false })

// Renders the correct panel content based on the active descriptor.
// Mounted inside AppContent, which handles the slide-in animation and
// the 200ms unmount delay so the exit animation can complete.
export function ActivePanel() {
  const { panel } = useSidePanel()
  if (!panel) return null

  switch (panel.type) {
    case 'add-person':
      return (
        <AddPersonPanel
          tourId={panel.tourId}
          personType={panel.personType}
          onSuccess={panel.onSuccess}
        />
      )
    case 'bulk-add':
      return (
        <BulkAdd
          tourId={panel.tourId}
          onSuccess={panel.onSuccess}
        />
      )
    case 'contact':
      return (
        <ContactSheet
          contact={panel.contact}
          tourContext={panel.tourContext}
          onSuccess={panel.onSuccess}
        />
      )
    case 'venue':
      return (
        <VenuePanel
          tourId={panel.tourId}
          showId={panel.showId}
          venueName={panel.venueName}
        />
      )
    case 'advance':
      return (
        <AdvancePanel
          tourId={panel.tourId}
          showId={panel.showId}
          venueName={panel.venueName}
        />
      )
    case 'send-rider':
      return (
        <SendRiderSheet
          tourId={panel.tourId}
          showId={panel.showId}
          departmentLabel={panel.departmentLabel}
          documents={panel.documents}
          people={panel.people}
          onSent={panel.onSent}
        />
      )
    case 'add-day':
      return (
        <AddDayPanel tourId={panel.tourId} initialDayType={panel.initialDayType} />
      )
    case 'edit-day':
      return (
        <AddDayPanel
          tourId={panel.tourId}
          tourDateId={panel.tourDateId}
          initialDayType={panel.dayType}
          initialDate={panel.date}
          initialNotes={panel.notes}
        />
      )
    case 'contact-view':
      return (
        <ContactPanel
          contactId={panel.contactId}
          tourContext={panel.tourContext}
          onSuccess={panel.onSuccess}
        />
      )
    case 'day-item':
      return (
        <DayItemPanel item={panel.item} tourId={panel.tourId} timezone={panel.timezone} />
      )
    case 'transport':
      return (
        <TransportPanel segment={panel.segment} timezone={panel.timezone} />
      )
    case 'hotel':
      return (
        <HotelPanel stay={panel.stay} />
      )
    case 'add-to-day':
      return (
        <AddFlow
          tourId={panel.tourId}
          tourDateId={panel.tourDateId}
          date={panel.date}
          timezone={panel.timezone}
          category={panel.category}
          onBack={panel.onBack}
        />
      )
    default:
      return null
  }
}
