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

// Mirrors AddCategory from components/schedule/add/add-flow.tsx
type ScheduleAddCategory = 'flight' | 'drive' | 'rail' | 'hotel'

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
  // day-calendar.tsx can compare active state without JSON.stringify, which
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
  // REE-22, REE-88: the one door into a day. One text input over buildAddOptions,
  // a preview of what Enter will do, enter commits. It commits a day_items row
  // directly for anything where the time is the point (a load-in, a soundcheck, a
  // curfew), and hands a flight/drive/rail/hotel off to the add-to-day form,
  // which has structure beyond a time. `date` and `timezone` are here so it can
  // open that form (the add-to-day descriptor needs both) and so its Back path
  // can reopen this one.
  | {
      type: 'day-form'
      tourId: string
      tourDateId: string
      date: string
      timezone: string
      // Pre-filled input, set when the form is opened by clicking empty grid
      // space (REE-56): the snapped wall-clock time, which the TM types the rest
      // of the line after. Also carried across the open-a-form-and-come-back trip
      // (REE-88), so the typed line survives a detour into the flight form.
      // Absent when opened from the '+' picker or the '/' shortcut, where the
      // input starts empty.
      initialInput?: string
    }

// The subset of PanelDescriptor that day-calendar.tsx can open: the variants
// that carry a stable key, used for active-state comparison instead of
// JSON.stringify.
export type SchedulePanelDescriptor = Extract<
  PanelDescriptor,
  { type: 'transport' | 'hotel' | 'day-item' }
>

/**
 * Rewrites the open schedule panel's stored times after a grid drag or resize.
 *
 * A detail panel holds a snapshot of its record, captured when the block was
 * clicked. Resizing that same block on the grid persists a new end (REE-85), but
 * the snapshot in this store does not know, so the panel keeps showing the stale
 * time: an item resized to end at 06:45 still reads "Ends --:--", and a Save from
 * that stale form would then write the empty end back over the one the resize
 * just added. This patches the snapshot so the panel reflects the move.
 *
 * Pure and keyed by `key` (the CalendarEvent id, e.g. `day_item:<id>`), so it
 * only touches the panel showing the moved record and leaves anything else, or a
 * closed panel, alone. Returns null when there is nothing to patch. `endsAt` maps
 * straight onto the record's own end column: a move that preserved a synthesised
 * end sends null here, which matches the null the write path left stored.
 */
export function patchScheduleItemTimes(
  panel: PanelDescriptor | null,
  key: string,
  startsAt: string,
  endsAt: string | null,
): PanelDescriptor | null {
  if (!panel) return null
  if (panel.type === 'day-item' && panel.key === key) {
    return { ...panel, item: { ...panel.item, starts_at: startsAt, ends_at: endsAt } }
  }
  if (panel.type === 'transport' && panel.key === key) {
    return { ...panel, segment: { ...panel.segment, depart_at: startsAt, arrive_at: endsAt } }
  }
  return null
}

interface SidePanelState {
  panel: PanelDescriptor | null
  isOpen: boolean
  open: (descriptor: PanelDescriptor) => void
  close: () => void
  // Called by day-calendar.tsx after a drag or resize commits, so a detail panel
  // open on the moved record shows the new times rather than the stale snapshot
  // it was opened with (REE-85). A no-op unless that record's panel is open.
  syncScheduleItemTimes: (key: string, startsAt: string, endsAt: string | null) => void
}

export const useSidePanel = create<SidePanelState>()((set) => ({
  panel: null,
  isOpen: false,
  open: (descriptor) => set({ panel: descriptor, isOpen: true }),
  close: () => set({ isOpen: false }),
  syncScheduleItemTimes: (key, startsAt, endsAt) =>
    set((state) => {
      if (!state.isOpen) return {}
      const next = patchScheduleItemTimes(state.panel, key, startsAt, endsAt)
      return next ? { panel: next } : {}
    }),
}))
