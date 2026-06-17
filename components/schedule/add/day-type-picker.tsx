'use client'

import { useEffect } from 'react'
import { Music, Mic2, Navigation, Newspaper, Coffee } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DayTypeOption = 'show' | 'rehearsal' | 'travel' | 'press' | 'day_off'

interface DayTypePickerProps {
  onSelect: (dayType: DayTypeOption) => void
}

const DAY_TYPES: {
  id: DayTypeOption
  label: string
  description: string
  shortcut: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { id: 'show',      label: 'Show',      description: 'Venue and day sheet',  shortcut: 'S', icon: Music      },
  { id: 'rehearsal', label: 'Rehearsal', description: 'Studio or stage',      shortcut: 'R', icon: Mic2       },
  { id: 'travel',    label: 'Travel',    description: 'Transit day',          shortcut: 'T', icon: Navigation },
  { id: 'press',     label: 'Press',     description: 'Interviews, promo',    shortcut: 'P', icon: Newspaper  },
  { id: 'day_off',   label: 'Day off',   description: 'Rest or free day',     shortcut: 'O', icon: Coffee     },
]

// Keyboard shortcut map — only active while this component is mounted (popover open).
const SHORTCUT_MAP: Record<string, DayTypeOption> = Object.fromEntries(
  DAY_TYPES.map(d => [d.shortcut, d.id])
)

export function DayTypePicker({ onSelect }: DayTypePickerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const key = e.key.toUpperCase()
      const dayType = SHORTCUT_MAP[key]
      if (dayType) {
        e.preventDefault()
        onSelect(dayType)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSelect])

  return (
    <div className="flex flex-col">
      {DAY_TYPES.map(({ id, label, description, shortcut, icon: Icon }) => (
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
          <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {shortcut}
          </kbd>
        </button>
      ))}
    </div>
  )
}
