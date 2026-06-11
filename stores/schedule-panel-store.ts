'use client'

import { create } from 'zustand'

// Identifies which timeline card is active in the right panel.
// Extended with full row data in edit panel components so they avoid re-fetching.
export type CardDescriptor =
  | { type: 'show';     showId: string }
  | { type: 'transport'; segmentId: string }
  | { type: 'hotel-checkin' | 'hotel-checkout'; stayId: string }
  | { type: 'event';    eventId: string }

interface SchedulePanelState {
  activeCard: CardDescriptor | null
  setActiveCard: (card: CardDescriptor | null) => void
}

export const useSchedulePanel = create<SchedulePanelState>()((set) => ({
  activeCard: null,
  setActiveCard: (card) => set({ activeCard: card }),
}))
