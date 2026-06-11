'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Render a stable placeholder until mounted to avoid hydration mismatch.
  if (!mounted) {
    return (
      <div className="h-7 w-full rounded-lg px-2" />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors w-full',
        'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
      )}
      style={{ color: 'var(--sidebar-muted-foreground)' }}
      aria-label="Toggle theme"
    >
      {isDark ? (
        <Sun className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <Moon className="h-3.5 w-3.5 shrink-0" />
      )}
      {isDark ? 'Light mode' : 'Dark mode'}
    </button>
  )
}
