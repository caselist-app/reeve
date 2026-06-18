'use client'

import { Menu } from 'lucide-react'
import { useMobileNav } from '@/stores/mobile-nav-store'

// Shown only below md. Provides the hamburger trigger that opens the nav
// drawer (wired in C5). Above md the sidebar is always visible and this bar
// is hidden.
export function MobileTopBar() {
  const { open } = useMobileNav()

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4 md:hidden">
      <button
        type="button"
        onClick={open}
        aria-label="Open navigation"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>
      <span className="text-sm font-semibold">Reeve</span>
    </div>
  )
}
