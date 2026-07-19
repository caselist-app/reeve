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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
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
  /** Icon-only rail mode. Defaults to false so MobileNavDrawer (which never
   *  collapses) needs no changes. */
  collapsed?: boolean
  /** Only needed when collapsed: lets Settings force an expand before it
   *  opens, since the settings overlay can't render at 64px. No-op default
   *  so MobileNavDrawer doesn't have to pass anything. */
  setCollapsed?: (value: boolean) => void
  /** Controlled settings-overlay state. When ResizableSidebar controls this,
   *  it can force the rail to stay expanded (see effectiveCollapsed) for as
   *  long as the overlay is open, even if collapse is toggled mid-session.
   *  Falls back to local state when unset, so MobileNavDrawer (which never
   *  collapses and has no such conflict) needs no changes. */
  settingsOpen?: boolean
  onSettingsOpenChange?: (open: boolean) => void
}

const TOUR_NAV = [
  { section: 'schedule', label: 'Schedule', icon: Calendar },
  { section: 'people', label: 'People', icon: Users },
] as const

const SECTION_ROUTE: Record<string, string> = {
  schedule: 'schedule',
  people: 'people',
}

export function Sidebar({
  tours,
  lastTourId = null,
  collapsed = false,
  setCollapsed = () => {},
  settingsOpen: settingsOpenProp,
  onSettingsOpenChange,
}: SidebarProps) {
  const pathname = usePathname()
  const { openPalette } = useCommandPalette()
  const [localSettingsOpen, setLocalSettingsOpen] = useState(false)
  const settingsOpen = settingsOpenProp ?? localSettingsOpen
  const setSettingsOpen = onSettingsOpenChange ?? setLocalSettingsOpen

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

  function openSettings() {
    // The settings overlay is absolute inset-0 inside the rail, so it can
    // only render sensibly at full width. Force an expand first.
    if (collapsed) setCollapsed(false)
    setSettingsOpen(true)
  }

  const isRoster = pathname.startsWith('/roster')

  const itemClass = (active: boolean) =>
    cn(
      'flex items-center rounded-lg text-xs font-medium transition-colors',
      collapsed ? 'h-10 w-10 justify-center md:h-8 md:w-8 mx-auto' : 'gap-2.5 px-2 h-10 md:h-7 w-full',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
    )

  return (
    <aside className="flex h-full flex-col bg-sidebar sticky top-0 relative overflow-hidden" style={{ width: '100%' }}>
      {/* Tour selector: top padding grows to cover the notch in the mobile drawer */}
      <div className={cn('pt-[max(1.25rem,var(--safe-top))] pb-4', collapsed ? 'px-2' : 'px-3')}>
        <TourSelector tours={tours} activeTourId={activeTourId} collapsed={collapsed} />
      </div>

      {/* Top nav: Search + Roster */}
      <div className={cn('pb-2', collapsed ? 'px-2' : 'px-3')}>
        <nav className="space-y-0.5">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={openPalette}
                  className={itemClass(false)}
                  style={{ color: 'var(--sidebar-muted-foreground)' }}
                  aria-label="Search"
                >
                  <Search className="h-3.5 w-3.5 shrink-0" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Search (⌘K)</TooltipContent>
            </Tooltip>
          ) : (
            <button
              onClick={openPalette}
              className={cn(itemClass(false), 'w-full')}
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
          )}

          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/roster"
                  className={itemClass(isRoster)}
                  style={isRoster ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
                  aria-label="Roster"
                >
                  <Contact className="h-3.5 w-3.5 shrink-0" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Roster</TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/roster"
              className={itemClass(isRoster)}
              style={isRoster ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
            >
              <Contact className="h-3.5 w-3.5 shrink-0" />
              Roster
            </Link>
          )}
        </nav>
      </div>

      {/* Tour nav */}
      {activeTourId && (
        <div className={cn('pb-2 mt-6', collapsed ? 'px-2' : 'px-3')}>
          {!collapsed && (
            <p
              className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider truncate"
              style={{ color: 'var(--sidebar-muted-foreground)' }}
            >
              {tours.find(t => t.id === activeTourId)?.name ?? 'Tour'}
            </p>
          )}
          <nav className="space-y-0.5">
            {TOUR_NAV.map(({ section, label, icon: Icon }) => {
              const active = isActive(section)
              const link = (
                <Link
                  key={section}
                  href={navHref(section)}
                  className={itemClass(active)}
                  style={active ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
                  aria-label={collapsed ? label : undefined}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {!collapsed && label}
                </Link>
              )
              if (!collapsed) return link
              return (
                <Tooltip key={section}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              )
            })}

            {/* Settings gear opens the tour settings overlay. */}
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={openSettings}
                    className={itemClass(false)}
                    style={{ color: 'var(--sidebar-muted-foreground)' }}
                    aria-label="Settings"
                  >
                    <Settings className="h-3.5 w-3.5 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
            ) : (
              <button
                onClick={openSettings}
                className={cn(itemClass(false), 'w-full')}
                style={{ color: 'var(--sidebar-muted-foreground)' }}
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                Settings
              </button>
            )}
          </nav>
        </div>
      )}

      <div className="flex-1" />

      {/* Tour settings overlay, slides over the sidebar. openSettings() forces
          an expand before opening, and ResizableSidebar additionally keeps
          the rail expanded for as long as settingsOpen is true (effectiveCollapsed),
          so this never has to render its full-text nav at 64px, including if
          collapse is toggled while the overlay is already open. */}
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
