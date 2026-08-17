'use client'

import { create } from 'zustand'

// Optimistic rehearsal location for the day-info block, keyed by rehearsal id.
//
// Same shape as guest-list-count-store.ts (REE-131): the block is
// server-rendered in DayContent, but it is mutated from the rehearsal panel,
// which lives in the app layout ABOVE the schedule route. A revalidatePath or
// router.refresh across that boundary does not reliably commit on the client,
// the exact shape of REE-65. So the panel writes the location it just saved
// here, and the block reads it, and the block tracks a save with no server
// round trip needed to commit.
//
// The block clears the override the moment a fresh server value arrives (a
// navigation, or a revalidate that did land), so the server is authoritative
// again and an external change is not shadowed for longer than one
// navigation.
interface RehearsalLocationState {
  locations: Record<string, string>
  setLocation: (rehearsalId: string, locationName: string) => void
  clear: (rehearsalId: string) => void
}

export const useRehearsalLocations = create<RehearsalLocationState>((set) => ({
  locations: {},
  setLocation: (rehearsalId, locationName) =>
    set((state) => ({ locations: { ...state.locations, [rehearsalId]: locationName } })),
  clear: (rehearsalId) =>
    set((state) => {
      if (!(rehearsalId in state.locations)) return state
      const next = { ...state.locations }
      delete next[rehearsalId]
      return { locations: next }
    }),
}))
