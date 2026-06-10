'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Users,
  Calendar,
  Plane,
  Building2,
  FileText,
  Settings,
  LayoutDashboard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TourSelector } from '@/components/nav/tour-selector'

interface Tour {
  id: string
  name: string
  artist_act: string
}

interface SidebarProps {
  tours: Tour[]
}

const TOUR_NAV = [
  { section: 'shows', label: 'Shows', icon: Calendar },
  { section: 'people', label: 'People', icon: Users },
  { section: 'transport', label: 'Transport', icon: Plane },
  { section: 'hotels', label: 'Hotels', icon: Building2 },
  { section: 'documents', label: 'Documents', icon: FileText },
  { section: 'settings', label: 'Settings', icon: Settings },
] as const

// Maps stub sections to the real route until dedicated pages are built.
const SECTION_ROUTE: Record<string, string> = {
  shows: 'shows',
  people: 'people',
  transport: 'shows',    // per-show via planner; top-level page in a future brief
  hotels: 'shows',       // per-show via hotel search; top-level page in a future brief
  documents: 'settings', // not yet built
  settings: 'settings',
}

export function Sidebar({ tours }: SidebarProps) {
  const pathname = usePathname()

  // Extract active tour ID from the current URL path.
  const tourIdMatch = pathname.match(/\/tours\/([^/]+)/)
  const activeTourId = tourIdMatch?.[1] ?? null

  function navHref(section: string): string {
    if (!activeTourId) return '/tours/new'
    const route = SECTION_ROUTE[section] ?? section
    return `/tours/${activeTourId}/${route}`
  }

  function isActive(section: string): boolean {
    if (!activeTourId) return false
    // Match against the section name itself, not its stub destination.
    // This prevents stubbed sections (transport, hotels) from inheriting
    // the active state of the real page they point to.
    return pathname.startsWith(`/tours/${activeTourId}/${section}`)
  }

  // "Home" goes to the per-tour overview; fall back to / if no tour is active.
  const homeHref = activeTourId ? `/tours/${activeTourId}` : '/'
  const isHome = activeTourId
    ? pathname === `/tours/${activeTourId}`
    : pathname === '/'

  return (
    <aside className="flex h-screen flex-col bg-sidebar sticky top-0" style={{ width: '100%' }}>
      {/* Tour selector */}
      <div className="px-3 pt-5 pb-4">
        <TourSelector tours={tours} activeTourId={activeTourId} />
      </div>

      {/* Tour nav */}
      {activeTourId && (
        <div className="px-3 pb-2">
          <p
            className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--sidebar-muted-foreground)' }}
          >
            Tour
          </p>
          <nav className="space-y-0.5">
            {TOUR_NAV.map(({ section, label, icon: Icon }) => {
              const active = isActive(section)
              return (
                <Link
                  key={section}
                  href={navHref(section)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'hover:bg-sidebar-accent/60',
                  )}
                  style={active ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      <div className="flex-1" />

      {/* Bottom nav */}
      <div className="px-3 py-3 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
        <Link
          href={homeHref}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2 h-7 text-xs font-medium transition-colors',
            isHome
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'hover:bg-sidebar-accent/60',
          )}
          style={isHome ? undefined : { color: 'var(--sidebar-muted-foreground)' }}
        >
          <LayoutDashboard className="h-3.5 w-3.5 shrink-0" />
          Home
        </Link>
      </div>
    </aside>
  )
}
