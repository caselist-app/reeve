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
      {/* Time column + connecting rail: desktop only. On mobile the time moves
          into the card header so the card uses the full width. */}
      <div className="hidden lg:block w-12 shrink-0 text-right">
        <span className="text-xs font-medium tabular-nums text-muted-foreground leading-none">
          {time}
        </span>
      </div>
      <div className="hidden lg:flex flex-col items-center shrink-0 mt-1">
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
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          {/* Time inside the card on mobile only. */}
          <span className="lg:hidden shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            {time}
          </span>
        </div>
        <p className="text-sm font-medium truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </button>
  )
}
