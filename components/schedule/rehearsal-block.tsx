'use client'

import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import { useSidePanel } from '@/stores/side-panel-store'
import { useRehearsalLocations } from '@/stores/rehearsal-location-store'
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
//
// The location name tracks the rehearsal panel through an optimistic store
// rather than a server refresh, the same reason and shape as GuestListBlock
// (REE-131): the panel is mounted in the app layout above this route, so a
// revalidate or refresh from it does not reliably repaint this block (REE-65).
export function RehearsalBlock({ rehearsal, timezone }: RehearsalBlockProps) {
  const { open } = useSidePanel()
  const override = useRehearsalLocations((s) => s.locations[rehearsal.id])
  const clear = useRehearsalLocations((s) => s.clear)

  // A new server value (a navigation, or a revalidate that did land) is the
  // source of truth: drop the optimistic override so an external change is
  // not shadowed.
  useEffect(() => {
    clear(rehearsal.id)
  }, [rehearsal.id, rehearsal.location_name, clear])

  const locationName = override ?? rehearsal.location_name

  return (
    <div className="-mx-2">
      <button
        type="button"
        onClick={() =>
          open({
            type: 'rehearsal',
            rehearsalId: rehearsal.id,
            locationName,
            tourTimezone: timezone,
          })
        }
        className="group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <span className="min-w-0 flex-1 text-sm font-semibold">{locationName}</span>
        <span className="mt-0.5 flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          view
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
    </div>
  )
}
