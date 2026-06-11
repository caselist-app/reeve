'use client'

import { useEffect, useRef, useCallback, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { Search, Calendar, Users, Settings, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPaletteData } from '@/lib/actions/palette'
import type { PaletteData } from '@/lib/actions/palette'
import { useCommandPalette } from '@/stores/command-palette-store'
import { useState } from 'react'

type ResultItem = {
  id: string
  label: string
  sublabel?: string
  icon: React.ReactNode
  href: string
}

function buildNavItems(tourId: string): ResultItem[] {
  return [
    { id: 'nav-home',     label: 'Home',     icon: <LayoutDashboard className="h-4 w-4" />, href: `/tours/${tourId}` },
    { id: 'nav-shows',    label: 'Shows',    icon: <Calendar className="h-4 w-4" />,        href: `/tours/${tourId}/shows` },
    { id: 'nav-people',   label: 'People',   icon: <Users className="h-4 w-4" />,           href: `/tours/${tourId}/people` },
    { id: 'nav-settings', label: 'Settings', icon: <Settings className="h-4 w-4" />,        href: `/tours/${tourId}/settings` },
  ]
}

function buildResults(tourId: string, data: PaletteData, query: string): ResultItem[] {
  const q = query.toLowerCase()

  const nav = buildNavItems(tourId).filter(
    (n) => !q || n.label.toLowerCase().includes(q),
  )

  const shows = data.shows
    .filter((s) => !q || s.venue_name.toLowerCase().includes(q) || s.date.includes(q))
    .map((s): ResultItem => ({
      id: `show-${s.id}`,
      label: s.venue_name,
      sublabel: new Date(`${s.date}T00:00:00`).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      }),
      icon: <Calendar className="h-4 w-4" />,
      href: `/tours/${tourId}/shows/${s.id}`,
    }))

  const people = data.people
    .filter((p) => !q || p.name.toLowerCase().includes(q))
    .map((p): ResultItem => ({
      id: `person-${p.id}`,
      label: p.name,
      sublabel: p.person_type,
      icon: <Users className="h-4 w-4" />,
      href: `/tours/${tourId}/people`,
    }))

  return [...nav, ...shows, ...people]
}

export function CommandPalette() {
  const router = useRouter()
  const pathname = usePathname()
  const { open, openPalette, closePalette, togglePalette } = useCommandPalette()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [data, setData] = useState<PaletteData | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const tourIdMatch = pathname.match(/\/tours\/([^/]+)/)
  const tourId = tourIdMatch?.[1] ?? null

  // Fetch palette data the first time this tour's palette is opened.
  const loadedTourRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open || !tourId) return
    if (loadedTourRef.current === tourId) return

    loadedTourRef.current = tourId
    startTransition(async () => {
      const result = await getPaletteData(tourId)
      setData(result)
    })
  }, [open, tourId])

  const results = tourId && data ? buildResults(tourId, data, query) : []
  const clampedSelected = results.length > 0 ? Math.min(selected, results.length - 1) : 0

  const navigate = useCallback(
    (href: string) => {
      closePalette()
      setQuery('')
      router.push(href)
    },
    [router, closePalette],
  )

  // ⌘K / Ctrl+K to toggle.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        togglePalette()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [togglePalette])

  // Reset query + focus input on open.
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      const item = results[clampedSelected]
      if (item) navigate(item.href)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => (v ? openPalette() : closePalette())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2',
            'rounded-2xl border border-border bg-background shadow-2xl outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]',
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>

          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className={cn('h-4 w-4 shrink-0 text-muted-foreground', isPending && 'animate-pulse')} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(0) }}
              onKeyDown={onInputKeyDown}
              placeholder="Search shows, people, pages..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto p-2">
            {!tourId ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Open a tour to search.
              </p>
            ) : isPending && !data ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                Loading...
              </p>
            ) : results.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No results for &ldquo;{query}&rdquo;.
              </p>
            ) : (
              <ul>
                {results.map((item, idx) => (
                  <li key={item.id}>
                    <button
                      onMouseEnter={() => setSelected(idx)}
                      onClick={() => navigate(item.href)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                        idx === clampedSelected
                          ? 'bg-accent text-accent-foreground'
                          : 'text-foreground hover:bg-accent/50',
                      )}
                    >
                      <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                      <span className="flex-1 truncate font-medium">{item.label}</span>
                      {item.sublabel && (
                        <span className="shrink-0 text-xs text-muted-foreground capitalize">{item.sublabel}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
            <span><kbd className="rounded border border-border bg-muted px-1 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="rounded border border-border bg-muted px-1 py-0.5">↵</kbd> open</span>
            <span><kbd className="rounded border border-border bg-muted px-1 py-0.5">⌘K</kbd> toggle</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
