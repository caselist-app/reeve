'use client'

import { create } from 'zustand'

interface CommandPaletteStore {
  open: boolean
  openPalette: () => void
  closePalette: () => void
  togglePalette: () => void
}

export const useCommandPalette = create<CommandPaletteStore>((set) => ({
  open: false,
  openPalette: () => set({ open: true }),
  closePalette: () => set({ open: false }),
  togglePalette: () => set((state) => ({ open: !state.open })),
}))
