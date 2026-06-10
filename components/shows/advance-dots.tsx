import { cn } from '@/lib/utils'
import type { Tables } from '@/lib/types/database'

type ShowAdvance = Tables<'show_advance'>

const DEPARTMENTS = ['status_audio', 'status_lighting', 'status_staging', 'status_hospitality', 'status_travel'] as const

const STATUS_COLOR: Record<string, string> = {
  confirmed: 'bg-green-500',
  in_progress: 'bg-amber-400',
  not_started: 'bg-muted-foreground/30',
  na: 'bg-muted-foreground/20',
}

interface AdvanceDotsProps {
  advance: ShowAdvance | null
}

export function AdvanceDots({ advance }: AdvanceDotsProps) {
  return (
    <div className="flex items-center gap-1">
      {DEPARTMENTS.map((dept) => {
        const status = advance ? (advance[dept] ?? 'not_started') : 'not_started'
        return (
          <span
            key={dept}
            title={dept.replace('status_', '')}
            className={cn('h-2 w-2 rounded-full shrink-0', STATUS_COLOR[status] ?? 'bg-muted-foreground/30')}
          />
        )
      })}
    </div>
  )
}
