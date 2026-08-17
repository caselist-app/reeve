'use client'

import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import type { DayRehearsal } from '@/lib/schedule/day-rehearsal'

interface RehearsalBlockProps {
  rehearsal: DayRehearsal
  timezone: string
}

// The Rehearsal block in the day info panel, and the only way into a
// rehearsal's detail now that /tours/[id]/rehearsals/[rehearsalId] is gone
// (REE-36). Same thin-client-that-calls-useSidePanel shape as VenueBlock and
// HotelBlock, so day-info-panel.tsx stays a Server Component. No map here,
// unlike those two: a rehearsal panel loads its own coordinates on open and
// they are not carried on the block's minimal fetch.
export function RehearsalBlock({ rehearsal, timezone }: RehearsalBlockProps) {
  const { open } = useSidePanel()

  return (
    <button
      type="button"
      onClick={() =>
        open({
          type: 'rehearsal',
          rehearsalId: rehearsal.id,
          locationName: rehearsal.location_name,
          tourTimezone: timezone,
        })
      }
      className="group -mx-2 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
    >
      <span className="min-w-0 flex-1 text-sm font-semibold">{rehearsal.location_name}</span>
      <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
        view
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}
