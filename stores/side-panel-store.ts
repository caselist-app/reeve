'use client'

import { create } from 'zustand'
import type { Tables } from '@/lib/types/database'

// Inline types to avoid circular imports with component files.
type PersonType = 'artist' | 'crew' | 'management' | 'support'

// Tables<'people'> & { contacts: Tables<'contacts'> }
// Mirrors PersonWithContact from components/people/people-view.tsx
type PersonWithContact = Tables<'people'> & { contacts: Tables<'contacts'> }

// Mirrors SendableDocument and ContactablePerson from components/shows/send-rider-sheet.tsx
type SendableDocument = { id: string; title: string; doc_type: string }
type ContactablePerson = { id: string; name: string; contact_email: string }

export type PanelDescriptor =
  | {
      type: 'person'
      tourId: string
      defaultType: PersonType
      person: PersonWithContact | null
      crewDetail: Tables<'crew_detail'> | null
      onSuccess: () => void
    }
  | {
      type: 'bulk-add'
      tourId: string
      onSuccess: () => void
    }
  | {
      type: 'contact'
      contact: Tables<'contacts'> | null
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
    }
  | {
      type: 'contact-view'
      contactId: string
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
