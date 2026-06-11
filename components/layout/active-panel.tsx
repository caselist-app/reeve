'use client'

import { useSidePanel } from '@/stores/side-panel-store'
import { PersonSheet } from '@/components/people/person-sheet'
import { BulkAdd } from '@/components/people/bulk-add'
import { ContactSheet } from '@/components/roster/contact-sheet'
import { AddShowPanel } from '@/components/shows/add-show-panel'
import { SendRiderSheet } from '@/components/shows/send-rider-sheet'
import { AddDayPanel } from '@/components/schedule/add-day-panel'

// Renders the correct panel content based on the active descriptor.
// Mounted inside AppContent, which handles the slide-in animation and
// the 200ms unmount delay so the exit animation can complete.
export function ActivePanel() {
  const { panel } = useSidePanel()
  if (!panel) return null

  switch (panel.type) {
    case 'person':
      return (
        <PersonSheet
          tourId={panel.tourId}
          defaultType={panel.defaultType}
          person={panel.person}
          crewDetail={panel.crewDetail}
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
          onSuccess={panel.onSuccess}
        />
      )
    case 'add-show':
      return (
        <AddShowPanel
          tourId={panel.tourId}
          onSuccess={panel.onSuccess}
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
        <AddDayPanel tourId={panel.tourId} />
      )
    default:
      return null
  }
}
