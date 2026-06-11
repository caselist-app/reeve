'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronsUpDown, Plus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Tour {
  id: string
  name: string
  artist_name: string
}

interface TourSelectorProps {
  tours: Tour[]
  activeTourId: string | null
}

export function TourSelector({ tours, activeTourId }: TourSelectorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const activeTour = tours.find((t) => t.id === activeTourId)

  function switchTour(tourId: string) {
    // Keep the current page section when switching tours where possible.
    // e.g. /tours/abc/shows -> /tours/xyz/shows
    const sectionMatch = pathname.match(/\/tours\/[^/]+\/([^/]+)/)
    const section = sectionMatch?.[1]
    if (section && ['shows', 'people', 'settings'].includes(section)) {
      router.push(`/tours/${tourId}/${section}`)
    } else {
      router.push(`/tours/${tourId}/shows`)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
            'hover:bg-sidebar-accent/60',
          )}
        >
          <div className="min-w-0 flex-1">
            {activeTour ? (
              <>
                <p className="truncate text-xs font-semibold" style={{ color: 'var(--sidebar-foreground)' }}>
                  {activeTour.artist_name}
                </p>
                <p className="truncate text-xs" style={{ color: 'var(--sidebar-muted-foreground)' }}>
                  {activeTour.name}
                </p>
              </>
            ) : (
              <p className="truncate text-xs font-medium" style={{ color: 'var(--sidebar-muted-foreground)' }}>
                Select tour
              </p>
            )}
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--sidebar-muted-foreground)' }} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        {tours.map((tour) => (
          <DropdownMenuItem
            key={tour.id}
            onSelect={() => switchTour(tour.id)}
            className={cn(tour.id === activeTourId && 'bg-accent')}
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{tour.artist_name}</p>
              <p className="truncate text-xs text-muted-foreground">{tour.name}</p>
            </div>
          </DropdownMenuItem>
        ))}

        {tours.length > 0 && <DropdownMenuSeparator />}

        <DropdownMenuItem onSelect={() => router.push('/tours/new')}>
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs">New tour</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
