'use client'

import { useRouter, usePathname } from 'next/navigation'
import { ChevronsUpDown, Plus, Check, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Tour {
  id: string
  name: string
  artist_id: string
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
    const sectionMatch = pathname.match(/\/tours\/[^/]+\/([^/]+)/)
    const section = sectionMatch?.[1]
    if (section && ['shows', 'people', 'settings'].includes(section)) {
      router.push(`/tours/${tourId}/${section}`)
    } else {
      router.push(`/tours/${tourId}/shows`)
    }
  }

  // Group tours by artist, preserving order of first appearance.
  const groups: { artistId: string; artistName: string; tours: Tour[] }[] = []
  const seen = new Map<string, number>()
  for (const tour of tours) {
    if (!seen.has(tour.artist_id)) {
      seen.set(tour.artist_id, groups.length)
      groups.push({ artistId: tour.artist_id, artistName: tour.artist_name, tours: [] })
    }
    groups[seen.get(tour.artist_id)!].tours.push(tour)
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
        {groups.map((group, i) => (
          <div key={group.artistId}>
            {i > 0 && <DropdownMenuSeparator />}
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-semibold text-muted-foreground">{group.artistName}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  router.push(`/artists/${group.artistId}/settings`)
                }}
                className="rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-foreground"
                aria-label={`${group.artistName} settings`}
              >
                <Settings className="h-3 w-3" />
              </button>
            </div>
            {group.tours.map((tour) => (
              <DropdownMenuItem
                key={tour.id}
                onSelect={() => switchTour(tour.id)}
                className="flex items-center gap-2"
              >
                <Check
                  className={cn(
                    'h-3 w-3 shrink-0',
                    tour.id === activeTourId ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="truncate text-xs">{tour.name}</span>
              </DropdownMenuItem>
            ))}
          </div>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={() => router.push('/tours/new')}>
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs">New tour</span>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => router.push('/artists/new')}>
          <Plus className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs">New artist</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
