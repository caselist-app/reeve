'use client'

import { Plane, Car, Train, Building2, Music, CalendarPlus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AddCategory = 'flight' | 'drive' | 'rail' | 'hotel' | 'show' | 'event'

interface AddPickerProps {
  onSelect: (category: AddCategory) => void
}

const CATEGORIES: { id: AddCategory; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'flight', label: 'Flight',  description: 'Airline segment',      icon: Plane       },
  { id: 'drive',  label: 'Drive',   description: 'Road transfer',         icon: Car         },
  { id: 'rail',   label: 'Rail',    description: 'Train or coach',        icon: Train       },
  { id: 'hotel',  label: 'Hotel',   description: 'Accommodation',         icon: Building2   },
  { id: 'show',   label: 'Show',    description: 'Venue and day sheet',   icon: Music       },
  { id: 'event',  label: 'Event',   description: 'Meal, meeting, other',  icon: CalendarPlus },
]

export function AddPicker({ onSelect }: AddPickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {CATEGORIES.map(({ id, label, description, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={cn(
            'flex flex-col items-start gap-1 rounded-lg border border-border px-3 py-3',
            'text-left transition-colors hover:bg-muted/50 hover:border-border/80',
          )}
        >
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold">{label}</span>
          <span className="text-[11px] text-muted-foreground leading-none">{description}</span>
        </button>
      ))}
    </div>
  )
}
