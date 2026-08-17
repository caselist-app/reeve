'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'

// Icon-only light/dark toggle for the public marketing page. This is a
// deliberate second theme switcher, not a duplicate of the one COMPONENTS.md
// names: components/account/appearance-settings.tsx's 3-way picker lives on
// /settings, which only an authenticated account can reach. A logged-out
// visitor has no account and no other way to control it. Two-way only (no
// "system" option) because a single icon button can only toggle, not pick
// from three; resolvedTheme still seeds the initial icon from the visitor's
// system preference.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-9 w-9 shrink-0" aria-hidden="true" />
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
