'use client'

import { create } from 'zustand'

// Optimistic tour-name overrides, keyed by tour id.
//
// Renaming a tour has to update the tour name in the sidebar (tour-selector.tsx),
// which lives in the app layout, above the settings route that edits it. Making
// that show up meant re-rendering the whole app layout via a server round-trip
// (revalidatePath('layout') or router.refresh()). That round-trip intermittently
// received the new data and never committed it on the client: the save stuck on
// "Saving..." with the old name until a reload, about one save in five (REE-65).
//
// So the visible rename no longer depends on that round-trip. On a successful
// save the form writes the new name here, the sidebar reads it, and the update
// is a plain client state change that cannot hang. The server data catches up on
// the next navigation (the app layout is a dynamic render, so it re-fetches),
// at which point the override simply matches what the server sends.
interface TourNameState {
  overrides: Record<string, string>
  setName: (tourId: string, name: string) => void
}

export const useTourNameStore = create<TourNameState>()((set) => ({
  overrides: {},
  setName: (tourId, name) =>
    set((state) => ({ overrides: { ...state.overrides, [tourId]: name } })),
}))
