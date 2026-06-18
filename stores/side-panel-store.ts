'use client'

import { create } from 'zustand'
import type { Tables } from '@/lib/types/database'

// Inline types to avoid circular imports with component files.
type PersonType = 'artist' | 'crew' | 'management' | 'support'

// Mirrors SendableDocument and ContactablePerson from components/shows/send-rider-sheet.tsx
type SendableDocument = { id: string; title: string; doc_type: string }
type ContactablePerson = { id: string; name: string; contact_email: string }

// Tour-specific context passed when opening a contact panel from the people
// page. Carries the membership fields (type, role, per-tour rates) that live
// on people / crew_detail, not on the contact itself.
export type ContactTourContext =
  | {
      mode: 'add'
      tourId: string
      defaultType: PersonType
    }
  | {
      mode: 'edit'
      personId: string
      tourId: string
      personType: PersonType
      role: string | null
      crewDetail: Tables<'crew_detail'> | null
    }

export type PanelDescriptor =
  | {
      type: 'bulk-add'
      tourId: string
      onSuccess: () => void
    }
  | {
      type: 'contact'
      contact: Tables<'contacts'> | null
      tourContext?: ContactTourContext
      onSuccess: (contactId?: string) => void
    }
  | {
      type: 'add-show'
      tourId: string
      onSuccess: (showId: string) => void
    }
  | {
      type: 'send-rider'
      tourId: string
      showId: string
      departmentLabel: string
      documents: SendableDocument[]
      people: ContactablePerson[]
      onSent: () => void
    }
  | {
      type: 'add-day'
      tourId: string
      initialDayType?: 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'
    }
  | {
      type: 'edit-day'
      tourId: string
      tourDateId: string
      date: string
      dayType: 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'
      notes: string | null
    }
  | {
      type: 'contact-view'
      contactId: string
      tourContext?: ContactTourContext & { mode: 'edit' }
      onSuccess: () => void
    }

interface SidePanelState {
  panel: PanelDescriptor | null
  isOpen: boolean
  open: (descriptor: PanelDescriptor) => void
  close: () => void
}

export const useSidePanel = create<SidePanelState>()((set) => ({
  panel: null,
  isOpen: false,
  open: (descriptor) => set({ panel: descriptor, isOpen: true }),
  close: () => set({ isOpen: false }),
}))
