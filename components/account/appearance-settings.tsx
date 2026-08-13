'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'

// Theme is a device preference, not tour data, so it lives on the account
// settings page rather than inside a tour's settings (REE-164). This is the
// one theme switcher in the app: don't add a second (see COMPONENTS.md).
export function AppearanceSettings() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="rounded-3xl border border-border bg-background p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">Appearance</h2>
        <p className="text-sm text-muted-foreground">Choose how Reeve looks on this device.</p>
      </div>

      {mounted && (
        <div className="mt-4 flex gap-2">
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTheme(t)}
              className={`rounded-md border px-3 py-1.5 text-sm capitalize transition-colors ${
                theme === t
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
