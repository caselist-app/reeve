'use client'

import { cn } from '@/lib/utils'
import { useSchedulePanel, type CardDescriptor } from '@/stores/schedule-panel-store'

interface TimelineCardProps {
  time: string          // formatted time string to display on the left
  label: string         // e.g. "Flight", "Load-in", "Hotel check-in"
  title: string         // primary line
  subtitle?: string     // secondary line
  accent: string        // Tailwind border-left colour class
  card: CardDescriptor  // what to set as activeCard on click
}

// Minimal 'use client' wrapper so timeline cards can trigger panel state
// while the parent day-timeline.tsx stays a Server Component.
export function TimelineCard({ time, label, title, subtitle, accent, card }: TimelineCardProps) {
  const { activeCard, setActiveCard } = useSchedulePanel()
  const isActive = activeCard
    ? JSON.stringify(activeCard) === JSON.stringify(card)
    : false

  return (
    <button
      onClick={() => setActiveCard(isActive ? null : card)}
      className={cn(
        'w-full text-left flex gap-3 px-8 py-3 transition-colors',
        isActive ? 'bg-muted/60' : 'hover:bg-muted/30',
      )}
    >
      {/* Time column */}
      <div className="w-12 shrink-0 text-right">
        <span className="text-xs font-medium tabular-nums text-muted-foreground leading-none">
          {time}
        </span>
      </div>

      {/* Connecting line + card */}
      <div className="flex flex-col items-center shrink-0 mt-1">
        <span className="h-2 w-2 rounded-full bg-border" />
        <span className="w-px flex-1 bg-border mt-1" />
      </div>

      {/* Card body */}
      <div
        className={cn(
          'flex-1 min-w-0 rounded-lg border-l-2 bg-card px-3 py-2 mb-1',
          accent,
        )}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">
          {label}
        </p>
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </button>
  )
}
