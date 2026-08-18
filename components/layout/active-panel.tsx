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
const SendDocumentSheet = dynamic(() => import('@/components/shows/send-document-sheet').then((m) => m.SendDocumentSheet), { ssr: false })
const VenuePanel = dynamic(() => import('@/components/schedule/panels/venue-panel').then((m) => m.VenuePanel), { ssr: false })
const AdvancePanel = dynamic(() => import('@/components/schedule/panels/advance-panel').then((m) => m.AdvancePanel), { ssr: false })
const GuestListPanel = dynamic(() => import('@/components/schedule/panels/guest-list-panel').then((m) => m.GuestListPanel), { ssr: false })
const RehearsalPanel = dynamic(() => import('@/components/schedule/panels/rehearsal-panel').then((m) => m.RehearsalPanel), { ssr: false })
const AddDayPanel = dynamic(() => import('@/components/schedule/add-day-panel').then((m) => m.AddDayPanel), { ssr: false })
// Brief 33: schedule day view detail and add panels.
// Brief 42: the show panel and the event panel are one day-item panel now.
const DayItemPanel = dynamic(() => import('@/components/schedule/panels/day-item-panel').then((m) => m.DayItemPanel), { ssr: false })
const TransportPanel = dynamic(() => import('@/components/schedule/panels/transport-panel').then((m) => m.TransportPanel), { ssr: false })
const HotelPanel = dynamic(() => import('@/components/schedule/panels/hotel-panel').then((m) => m.HotelPanel), { ssr: false })
const AddFlow = dynamic(() => import('@/components/schedule/add/add-flow').then((m) => m.AddFlow), { ssr: false })
// REE-22: the typed one-line fast path, beside the AddFlow category picker.
const DayForm = dynamic(() => import('@/components/schedule/day-form').then((m) => m.DayForm), { ssr: false })
// REE-154: the extraction detail view's row review panel.
const ExtractionRowsPanel = dynamic(() => import('@/components/inbox/extraction-rows-panel').then((m) => m.ExtractionRowsPanel), { ssr: false })
// REE-3: the manual document upload panel.
const UploadDocumentPanel = dynamic(() => import('@/components/documents/upload-document-panel').then((m) => m.UploadDocumentPanel), { ssr: false })
// REE-224: the Telegram deep-link generator, formerly its own AlertDialog.
const ConnectTelegramPanel = dynamic(() => import('@/components/roster/connect-telegram-panel').then((m) => m.ConnectTelegramPanel), { ssr: false })

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
    case 'guest-list':
      return (
        <GuestListPanel
          tourId={panel.tourId}
          showId={panel.showId}
          venueName={panel.venueName}
        />
      )
    case 'rehearsal':
      return (
        <RehearsalPanel
          rehearsalId={panel.rehearsalId}
          locationName={panel.locationName}
          tourTimezone={panel.tourTimezone}
        />
      )
    case 'send-rider':
      return (
        <SendDocumentSheet
          tourId={panel.tourId}
          showId={panel.showId}
          shows={panel.shows}
          sectionLabel={panel.sectionLabel}
          documents={panel.documents}
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
          hasShow={panel.hasShow}
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
        // Keyed on the times so a grid resize that rewrites them in the store
        // (REE-85) remounts the form and its uncontrolled defaultValue time
        // inputs pick the new end up. The panel's own save does not touch the
        // store snapshot, so this key is stable across a save and its "Saved."
        // and notify flow survive.
        <DayItemPanel
          key={`${panel.item.starts_at ?? ''}|${panel.item.ends_at ?? ''}`}
          item={panel.item}
          tourId={panel.tourId}
          timezone={panel.timezone}
          dayShowId={panel.dayShowId}
        />
      )
    case 'transport':
      return (
        // Same remount-on-resize reasoning as day-item above (REE-85): the
        // depart/arrive inputs are uncontrolled defaultValues.
        <TransportPanel
          key={`${panel.segment.depart_at ?? ''}|${panel.segment.arrive_at ?? ''}`}
          segment={panel.segment}
          timezone={panel.timezone}
          tourId={panel.tourId}
        />
      )
    case 'hotel':
      return (
        <HotelPanel stay={panel.stay} tourId={panel.tourId} />
      )
    case 'add-to-day':
      return (
        <AddFlow
          tourId={panel.tourId}
          tourDateId={panel.tourDateId}
          date={panel.date}
          timezone={panel.timezone}
          category={panel.category}
          initialClock={panel.initialClock}
          initialQuery={panel.initialQuery}
          onBack={panel.onBack}
        />
      )
    case 'day-form':
      return (
        // Keyed on the pre-filled type text and clocks so highlighting a second
        // slot while the panel is already open remounts the form onto the new
        // time, rather than React reusing the instance and keeping the first
        // slot's stale field state (REE-70). A remount also re-runs the focus
        // effect.
        <DayForm
          key={`${panel.initialInput ?? ''}|${panel.initialStartClock ?? ''}|${panel.initialEndClock ?? ''}`}
          tourId={panel.tourId}
          tourDateId={panel.tourDateId}
          date={panel.date}
          timezone={panel.timezone}
          initialInput={panel.initialInput}
          initialStartClock={panel.initialStartClock}
          initialEndClock={panel.initialEndClock}
        />
      )
    case 'extraction-rows':
      return (
        <ExtractionRowsPanel
          forwardedEmailId={panel.forwardedEmailId}
          subjectLine={panel.subjectLine}
          proposal={panel.proposal}
        />
      )
    case 'upload-document':
      return (
        <UploadDocumentPanel tourId={panel.tourId} onSuccess={panel.onSuccess} />
      )
    case 'connect-telegram':
      return (
        <ConnectTelegramPanel
          contactId={panel.contactId}
          contactName={panel.contactName}
          onBack={panel.onBack}
        />
      )
    default:
      return null
  }
}
