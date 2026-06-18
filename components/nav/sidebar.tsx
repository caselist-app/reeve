'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import {
  Users,
  Calendar,
  Settings,
  Search,
  Contact,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TourSelector } from '@/components/nav/tour-selector'
import { TourSettingsPanel } from '@/components/nav/tour-settings-panel'
import { useCommandPalette } from '@/stores/command-palette-store'

interface Tour {
  id: string
  name: string
  artist_id: string
  artist_name: string
}

interface SidebarProps {
  tours: Tour[]
  /** Last tour visited, read from a cookie server-side, so account-level pages
   *  (e.g. Roster) keep the tour context after a hard reload. */
  lastTourId?: string | null
}

const TOUR_NAV = [
  { section: 'schedule', label: 'Schedule', icon: Calendar },
  { section: 'people', label: 'People', icon: Users },
] as const

const SECTION_ROUTE: Record<string, string> = {
  schedule: 'schedule',
  people: 'people',
}

export function Sidebar({ tours, lastTourId = null }: SidebarProps) {
  const pathname = usePathname()
  const { openPalette } = useCommandPalette()
  const [settingsOpen, setSettingsOpen] = useState(false)

  const tourIdMatch = pathname.match(/\/tours\/([^/]+)/)
  const pathTourId = tourIdMatch?.[1] ?? null

  const [rememberedTourId, setRememberedTourId] = useState<string | null>(lastTourId)
  useEffect(() => {
    if (pathTourId && pathTourId !== rememberedTourId) {
      setRememberedTourId(pathTourId)
      document.cookie = `reeve:last-tour=${pathTourId}; path=/; max-age=31536000; samesite=lax`
    }
  }, [pathTourId, rememberedTourId])

  const activeTourId = pathTourId ?? rememberedTourId

  function navHref(section: string): string {
    if (!activeTourId) return '/tours/new'
    const route = SECTION_ROUTE[section] ?? section
    return `/tours/${activeTourId}/${route}`
  }

  function isActive(section: string): boolean {
    if (!activeTourId) return false
    return pathname.startsWith(`/tours/${activeTourId}/${section}`)
  }

  const isRoster = pathname.startsWith('/roster')

  return (
    <aside className="flex h-full flex-col bg-sidebar sticky top-0 relative overflow-hidden" style={{ width: '100%' }}>
      {/* Tour selector: top padding grows to cover the notch in the mobile drawer */}
      <div className="px-3 pt-[max(1.25rem,var(--safe-top))] pb-4">
        <TourSelector tours={tours} activeTourId={activeTourId} />
      </div>

      {/* Top nav: Search + Roster */}
      <div className="px-3 pb-2">
        <nav className="space-y-0.5">
          <button
            onClick={openPalette}
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 h-10 md:h-7 text-xs font-medium transition-colors w-full',
              'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
            style={{ color: 'var(--sidebar-muted-foreground)' }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            Search
            <kbd
              className="ml-auto hidden rounded border px-1 py-0.5 text-[10px] leading-none md:inline-block"
              style={{ borderColor: 'var(--sidebar-border)', color: 'var(--sidebar-muted-foreground)' }}
            >
              ⌘K
            </kbd>
          </button>

          <Link
            href="/roster"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2 h-10 md:h-7 text-xs font-medium transition-colors',
              isRoster
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
            )}
            style={isRoster ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
          >
            <Contact className="h-3.5 w-3.5 shrink-0" />
            Roster
          </Link>
        </nav>
      </div>

      {/* Tour nav */}
      {activeTourId && (
        <div className="px-3 pb-2 mt-6">
<p
            className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider truncate"
            style={{ color: 'var(--sidebar-muted-foreground)' }}
          >
            {tours.find(t => t.id === activeTourId)?.name ?? 'Tour'}
          </p>
          <nav className="space-y-0.5">
            {TOUR_NAV.map(({ section, label, icon: Icon }) => {
              const active = isActive(section)
              return (
                <Link
                  key={section}
                  href={navHref(section)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2 h-10 md:h-7 text-xs font-medium transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  )}
                  style={active ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </Link>
              )
            })}

            {/* Settings gear opens the tour settings overlay. */}
            <button
              onClick={() => setSettingsOpen(true)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 h-10 md:h-7 text-xs font-medium transition-colors w-full',
                'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
              style={{ color: 'var(--sidebar-muted-foreground)' }}
            >
              <Settings className="h-3.5 w-3.5 shrink-0" />
              Settings
            </button>
          </nav>
        </div>
      )}

      <div className="flex-1" />

      {/* Tour settings overlay, slides over the sidebar. */}
      {activeTourId && (
        <TourSettingsPanel
          tourId={activeTourId}
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </aside>
  )
}
