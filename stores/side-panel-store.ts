'use client'

import { create } from 'zustand'
import type { Tables } from '@/lib/types/database'

// Inline types to avoid circular imports with component files.
type PersonType = 'artist' | 'crew' | 'management' | 'support'

// Mirrors SendableDocument and ContactablePerson from components/shows/send-rider-sheet.tsx
type SendableDocument = { id: string; title: string; doc_type: string }
type ContactablePerson = { id: string; name: string; contact_email: string }

// ShowDaySheet is gone. Brief 42: a show's times are day_items rows and are
// edited one at a time through the 'day-item' descriptor below. The rest of a
// show (venue, catering, advance, delete) is the 'venue' descriptor, reached
// from the venue block in day info.

// Mirrors Segment from components/schedule/panels/transport-panel.tsx
type ScheduleTransportSegment = Pick<
  Tables<'transport_segments'>,
  | 'id' | 'mode' | 'origin' | 'destination' | 'depart_at' | 'arrive_at'
  | 'carrier_operator' | 'vehicle_or_flight_no' | 'booking_reference' | 'status'
  | 'origin_iata' | 'destination_iata' | 'flight_status'
  | 'actual_depart_at' | 'actual_arrive_at' | 'gate' | 'terminal' | 'last_tracked_at'
>

// Mirrors Stay from components/schedule/panels/hotel-panel.tsx
type ScheduleHotelStay = Pick<
  Tables<'hotel_stays'>,
  | 'id' | 'name' | 'address'
  | 'check_in_date' | 'check_in_time'
  | 'check_out_date' | 'check_out_time'
  | 'wifi_network' | 'wifi_password'
>

// Mirrors DayItem from components/schedule/panels/day-item-panel.tsx. Brief 42
// replaced the day-event descriptor with this: a freeform event is now an item
// of kind 'other', so one panel edits everything on a day.
type ScheduleDayItem = Pick<
  Tables<'day_items'>,
  'id' | 'show_id' | 'kind' | 'title' | 'starts_at' | 'ends_at' | 'location' | 'notes'
>

// Mirrors AddCategory from components/schedule/add/add-picker.tsx
type ScheduleAddCategory = 'flight' | 'drive' | 'rail' | 'hotel' | 'show' | 'event'

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
      // Venue detail for a show, loaded by the panel from showId. Carries only
      // what the header needs, deliberately: see VenuePanel.
      type: 'venue'
      tourId: string
      showId: string
      venueName: string
    }
  | {
      // The advance for a show. Same reasoning as 'venue': the panel fetches.
      type: 'advance'
      tourId: string
      showId: string
      venueName: string
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
  | {
      type: 'add-person'
      tourId: string
      personType: PersonType
      onSuccess: () => void
    }
  // Brief 33: schedule day view detail panels. Each carries a stable key so
  // timeline-card.tsx can compare active state without JSON.stringify, which
  // Brief 26 flagged as sensitive to key ordering.
  | {
      type: 'transport'
      key: string
      segment: ScheduleTransportSegment
      timezone: string
    }
  | {
      type: 'hotel'
      key: string
      stay: ScheduleHotelStay
    }
  | {
      // Brief 42: one panel for anything on a day, replacing the show panel's
      // twenty-field day sheet and the event panel. `tourId` is here for the
      // change alert: who to notify is resolved from the tour's people.
      type: 'day-item'
      key: string
      tourId: string
      item: ScheduleDayItem
      timezone: string
    }
  // Brief 33: the add-to-day form, opened from the category popover/sheet in
  // day-view-client.tsx. onBack closes this panel and reopens that picker,
  // a closure rather than a stored value since it has to coordinate with
  // local popover/sheet state day-view-client.tsx owns.
  | {
      type: 'add-to-day'
      tourId: string
      tourDateId: string
      date: string
      timezone: string
      category: ScheduleAddCategory
      onBack: () => void
    }

// The subset of PanelDescriptor that timeline-card.tsx can open: the variants
// that carry a stable key, used for active-state comparison instead of
// JSON.stringify.
export type SchedulePanelDescriptor = Extract<
  PanelDescriptor,
  { type: 'transport' | 'hotel' | 'day-item' }
>

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
