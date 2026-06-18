'use client'

import { create } from 'zustand'

interface MobileNavState {
  isOpen: boolean
  open: () => void
  close: () => void
}

export const useMobileNav = create<MobileNavState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}))
