'use client'

import { useEffect } from 'react'
import { Plane, Car, Train, Building2, Music, CalendarPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AddCategory = 'flight' | 'drive' | 'rail' | 'hotel' | 'show' | 'event'

interface AddPickerProps {
  onSelect: (category: AddCategory) => void
}

const CATEGORIES: {
  id: AddCategory
  label: string
  description: string
  shortcut: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'flight', label: 'Flight', description: 'Airline segment',     shortcut: 'F', icon: Plane        },
  { id: 'drive',  label: 'Drive',  description: 'Road transfer',        shortcut: 'D', icon: Car          },
  { id: 'rail',   label: 'Rail',   description: 'Train or coach',       shortcut: 'R', icon: Train        },
  { id: 'hotel',  label: 'Hotel',  description: 'Accommodation',        shortcut: 'H', icon: Building2    },
  { id: 'show',   label: 'Show',   description: 'Venue and day sheet',  shortcut: 'S', icon: Music        },
  { id: 'event',  label: 'Event',  description: 'Meal, meeting, other', shortcut: 'E', icon: CalendarPlus },
]

// Keyboard shortcut map — scoped to when this component is mounted (i.e. popover is open).
const SHORTCUT_MAP: Record<string, AddCategory> = Object.fromEntries(
  CATEGORIES.map(c => [c.shortcut, c.id])
)

export function AddPicker({ onSelect }: AddPickerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toUpperCase()
      const category = SHORTCUT_MAP[key]
      if (category) {
        e.preventDefault()
        onSelect(category)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSelect])

  return (
    <div className="flex flex-col">
      {CATEGORIES.map(({ id, label, description, shortcut, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-2',
            'text-left transition-colors hover:bg-muted/60',
          )}
        >
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-1 items-baseline gap-1.5 min-w-0">
            <span className="text-sm font-medium">{label}</span>
            <span className="truncate text-[11px] text-muted-foreground">{description}</span>
          </div>
          <kbd className="hidden shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground md:inline-block">
            {shortcut}
          </kbd>
        </button>
      ))}
    </div>
  )
}
