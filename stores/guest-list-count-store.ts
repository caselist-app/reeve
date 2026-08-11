'use client'

import { create } from 'zustand'

// Optimistic guest-list counts for the day-info block, keyed by show.
//
// The block is server-rendered in DayContent, but it is mutated from the guest
// list panel, which lives in the app layout ABOVE the schedule route. A
// revalidatePath or router.refresh across that boundary does not reliably commit
// on the client: it is the exact shape of REE-65, where a nested surface tried to
// repaint something rendered above it and intermittently never committed the
// payload. So the panel writes the count it just re-read here, and the block
// reads it, and the count tracks a mutation with no server round trip.
//
// The block clears the override the moment a fresh server summary arrives (a
// navigation, or a revalidate that did land), so the server is authoritative
// again and an external change, for example a chat request, is not shadowed for
// longer than one navigation.
export interface GuestCount {
  total: number
  waiting: number
}

interface GuestCountState {
  counts: Record<string, GuestCount>
  setCount: (showId: string, count: GuestCount) => void
  clear: (showId: string) => void
}

export const useGuestCounts = create<GuestCountState>((set) => ({
  counts: {},
  setCount: (showId, count) =>
    set((state) => ({ counts: { ...state.counts, [showId]: count } })),
  clear: (showId) =>
    set((state) => {
      if (!(showId in state.counts)) return state
      const next = { ...state.counts }
      delete next[showId]
      return { counts: next }
    }),
}))
