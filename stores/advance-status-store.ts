'use client'

import { create } from 'zustand'
import type { AdvanceStatuses } from '@/lib/schedule/advance-summary'

// Optimistic advance statuses for the day-info block, keyed by show. Same
// shape and same reason as stores/guest-list-count-store.ts (REE-131).
//
// The block is server-rendered in DayContent, but it is mutated from
// AdvanceTracker in the advance panel, which lives in the app layout ABOVE the
// schedule route. A revalidatePath or router.refresh across that boundary does
// not reliably commit on the client: it is the exact shape of REE-65, where a
// nested surface tried to repaint something rendered above it and
// intermittently never committed the payload. So the tracker writes the
// statuses it just confirmed here, and the block reads them, and the chips
// track a mutation with no server round trip.
//
// The block clears the override the moment a fresh server summary arrives (a
// navigation, or a revalidate that did land), so the server is authoritative
// again and an external change is not shadowed for longer than one navigation.
interface AdvanceStatusState {
  statuses: Record<string, AdvanceStatuses>
  setStatuses: (showId: string, statuses: AdvanceStatuses) => void
  clear: (showId: string) => void
}

export const useAdvanceStatuses = create<AdvanceStatusState>((set) => ({
  statuses: {},
  setStatuses: (showId, statuses) =>
    set((state) => ({ statuses: { ...state.statuses, [showId]: statuses } })),
  clear: (showId) =>
    set((state) => {
      if (!(showId in state.statuses)) return state
      const next = { ...state.statuses }
      delete next[showId]
      return { statuses: next }
    }),
}))
